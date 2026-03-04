import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { type ConnectedAccount, Prisma, type User } from '@prisma/client';
import { omit } from 'lodash-es';

import {
  CannotDeleteAccountWithOwnedTeamWorkspace,
  CryptoHelper,
  EmailAlreadyUsed,
  EventBus,
  UserNotFound,
  WrongSignInCredentials,
  WrongSignInMethod,
} from '../base';
import { BaseModel } from './base';
import {
  publicUserSelect,
  type UserFeatureName,
  WorkspaceRole,
  workspaceUserSelect,
} from './common';
import type { Workspace } from './workspace';

type CreateUserInput = Omit<Prisma.UserCreateInput, 'name'> & { name?: string };
type UpdateUserInput = Omit<Partial<Prisma.UserCreateInput>, 'id'>;

type CreateConnectedAccountInput = Omit<
  Prisma.ConnectedAccountUncheckedCreateInput,
  'id'
> & { accessToken: string };
type UpdateConnectedAccountInput = Omit<
  Prisma.ConnectedAccountUncheckedUpdateInput,
  'id'
>;

declare global {
  interface Events {
    'user.created': User;
    'user.updated': User;
    'user.deleted': User & {
      // TODO(@forehalo): unlink foreign key constraint on [WorkspaceUserPermission] to delegate
      // dealing of owned workspaces of deleted users to workspace model
      ownedWorkspaces: Workspace['id'][];
    };
    'user.postCreated': User;
  }
}

interface UserFilter {
  withDisabled?: boolean;
}

export interface ItemWithUserId {
  userId: string;
}

export type PublicUser = Pick<User, keyof typeof publicUserSelect>;
export type WorkspaceUser = Pick<User, keyof typeof workspaceUserSelect>;
export type { ConnectedAccount, User };

@Injectable()
export class UserModel extends BaseModel {
  constructor(
    private readonly crypto: CryptoHelper,
    private readonly event: EventBus
  ) {
    super();
  }

  async get(id: string, filter: UserFilter = {}) {
    return this.db.user.findUnique({
      where: { id, disabled: filter.withDisabled ? undefined : false },
    });
  }

  async getPublicUser(id: string): Promise<PublicUser | null> {
    return this.db.user.findUnique({
      select: publicUserSelect,
      where: { id, disabled: false },
    });
  }

  async getPublicUsers(ids: string[]): Promise<PublicUser[]> {
    return this.db.user.findMany({
      select: publicUserSelect,
      where: { id: { in: ids }, disabled: false },
    });
  }

  async getPublicUsersMap<T extends ItemWithUserId>(
    items: T[]
  ): Promise<Map<string, PublicUser>> {
    const userIds = new Set<string>();
    for (const item of items) {
      if (item.userId) {
        userIds.add(item.userId);
      }
    }
    const users = await this.getPublicUsers(Array.from(userIds));
    return new Map(users.map(user => [user.id, user]));
  }

  async getWorkspaceUser(id: string): Promise<WorkspaceUser | null> {
    return this.db.user.findUnique({
      select: workspaceUserSelect,
      where: { id, disabled: false },
    });
  }

  async getWorkspaceUsers(ids: string[]): Promise<WorkspaceUser[]> {
    return this.db.user.findMany({
      select: workspaceUserSelect,
      where: { id: { in: ids }, disabled: false },
    });
  }

  async getUserByEmail(
    email: string,
    filter: UserFilter = {}
  ): Promise<User | null> {
    const rows = await this.db.$queryRaw<User[]>`
      SELECT id, name, email, password, registered, email_verified as "emailVerifiedAt", avatar_url as "avatarUrl", registered, created_at as "createdAt", disabled
      FROM "users"
      WHERE lower("email") = lower(${email})
      ${Prisma.raw(filter.withDisabled ? '' : 'AND disabled = false')}
    `;

    return rows[0] ?? null;
  }

  async signIn(email: string, password: string): Promise<User> {
    const user = await this.getUserByEmail(email);

    if (!user) {
      throw new WrongSignInCredentials({ email });
    }

    if (!user.password) {
      throw new WrongSignInMethod();
    }

    const passwordMatches = await this.crypto.verifyPassword(
      password,
      user.password
    );

    if (!passwordMatches) {
      throw new WrongSignInCredentials({ email });
    }

    return user;
  }

  async getPublicUserByEmail(email: string): Promise<PublicUser | null> {
    const rows = await this.db.$queryRaw<PublicUser[]>`
      SELECT id, name, avatar_url as "avatarUrl"
      FROM "users"
      WHERE lower("email") = lower(${email})
      AND disabled = false
    `;

    return rows[0] ?? null;
  }

  async create(data: CreateUserInput) {
    let user = await this.getUserByEmail(data.email, { withDisabled: true });

    if (user) {
      throw new EmailAlreadyUsed();
    }

    if (data.password) {
      data.password = await this.crypto.encryptPassword(data.password);
    }

    user = await this.db.user.create({
      data: {
        ...data,
        name: data.name ?? data.email.split('@')[0],
      },
    });

    // delegate the responsibility of finish user creating setup to the corresponding models
    await this.event.emitAsync('user.postCreated', user);

    this.logger.debug(`User [${user.id}] created with email [${user.email}]`);
    this.event.emit('user.created', user);

    return user;
  }

  async importUsers(inputs: CreateUserInput[]) {
    return await Promise.allSettled(
      inputs.map(async input => {
        return await this.create({
          ...input,
          registered: true,
        });
      })
    );
  }

  @Transactional()
  async update(id: string, data: UpdateUserInput) {
    if (data.password) {
      data.password = await this.crypto.encryptPassword(data.password);
    }

    if (data.email) {
      const user = await this.getUserByEmail(data.email, {
        withDisabled: true,
      });
      if (user && user.id !== id) {
        throw new EmailAlreadyUsed();
      }
    }

    const user = await this.db.user.update({
      where: { id },
      data,
    });

    this.logger.debug(`User [${user.id}] updated`);
    this.event.emit('user.updated', user);
    return user;
  }

  /**
   * Mark a existing user or create a new one as registered and email verified.
   *
   * When user created by others invitation, we will leave it as unregistered.
   */
  async fulfill(email: string, data: Omit<UpdateUserInput, 'email'> = {}) {
    const user = await this.getUserByEmail(email, { withDisabled: true });

    if (!user) {
      return this.create({
        email,
        registered: true,
        emailVerifiedAt: new Date(),
        ...data,
      });
    } else {
      if (user.disabled) {
        throw new UserNotFound();
      }

      if (user.registered) {
        delete data.registered;
      } else {
        data.registered = true;
      }

      if (user.emailVerifiedAt) {
        delete data.emailVerifiedAt;
      } else {
        data.emailVerifiedAt = new Date();
      }

      if (Object.keys(data).length) {
        return await this.update(user.id, data);
      }
    }

    return user;
  }

  async ownedWorkspaces(id: string) {
    return await this.models.workspaceUser.getUserActiveRoles(id, {
      role: WorkspaceRole.Owner,
    });
  }

  async delete(id: string) {
    const ownedWorkspaces = await this.ownedWorkspaces(id);

    for (const ws of ownedWorkspaces) {
      const isTeamWorkspace = await this.models.workspace.isTeamWorkspace(
        ws.workspaceId
      );

      if (isTeamWorkspace) {
        throw new CannotDeleteAccountWithOwnedTeamWorkspace();
      }
    }

    const user = await this.db.user.delete({ where: { id } });

    this.event.emit('user.deleted', {
      ...user,
      ownedWorkspaces: ownedWorkspaces.map(r => r.workspaceId),
    });

    return user;
  }

  async ban(id: string) {
    // ban an user barely share the same logic with delete an user,
    // but keep the record with `disabled` flag
    // we delete the account and create it again to trigger all cleanups
    let user = await this.delete(id);
    user = await this.db.user.create({
      data: {
        ...omit(user, 'id'),
        disabled: true,
      },
    });

    await this.event.emitAsync('user.postCreated', user);

    return user;
  }

  async enable(id: string) {
    return await this.db.user.update({
      where: { id },
      data: { disabled: false },
    });
  }

  private buildListWhere(options: {
    keyword?: string | null;
    features?: UserFeatureName[] | null;
    after?: Date;
  }): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};

    if (options.after) {
      where.createdAt = {
        gt: options.after,
      };
    }

    const keyword = options.keyword?.trim();
    if (keyword) {
      where.OR = [
        {
          email: {
            contains: keyword,
            mode: 'insensitive',
          },
        },
        {
          id: {
            contains: keyword,
          },
        },
      ];
    }

    if (options.features?.length) {
      where.features = {
        some: {
          name: {
            in: options.features,
          },
          activated: true,
        },
      };
    }

    return where;
  }

  async list(options: {
    skip?: number;
    take?: number;
    keyword?: string | null;
    features?: UserFeatureName[] | null;
    after?: Date;
  }) {
    const where = this.buildListWhere(options);

    return this.db.user.findMany({
      where,
      orderBy: {
        createdAt: 'asc',
      },
      skip: options.skip,
      take: options.take,
    });
  }

  async count(
    options: {
      keyword?: string | null;
      features?: UserFeatureName[] | null;
      after?: Date;
    } = {}
  ) {
    const where = this.buildListWhere(options);
    return this.db.user.count({ where });
  }

  // #region ConnectedAccount

  async createConnectedAccount(data: CreateConnectedAccountInput) {
    const account = await this.db.connectedAccount.create({
      data,
    });
    this.logger.debug(
      `Connected account ${account.provider}:${account.id} created`
    );
    return account;
  }

  async getConnectedAccount(provider: string, providerAccountId: string) {
    return await this.db.connectedAccount.findFirst({
      where: { provider, providerAccountId },
      include: {
        user: true,
      },
    });
  }

  async updateConnectedAccount(id: string, data: UpdateConnectedAccountInput) {
    return await this.db.connectedAccount.update({
      where: { id },
      data,
    });
  }

  async deleteConnectedAccount(id: string) {
    const { count } = await this.db.connectedAccount.deleteMany({
      where: { id },
    });
    if (count > 0) {
      this.logger.log(`Deleted connected account ${id}`);
    }
    return count;
  }

  // #endregion
}
