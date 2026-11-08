import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { omit } from 'lodash-es';

import {
  CannotDeleteAccountWithOwnedTeamWorkspace,
  CryptoHelper,
  EmailAlreadyUsed,
  EventBus,
} from '../base';
import { BaseModel } from './base';
import {
  publicUserSelect,
  type UserFeatureName,
  WorkspaceRole,
  workspaceUserSelect,
} from './common';

type CreateUserInput = Omit<Prisma.UserCreateInput, 'name'> & { name?: string };
type UpdateUserProfileInput = Pick<
  Prisma.UserUpdateInput,
  'name' | 'avatarUrl'
>;

declare global {
  interface Events {
    'user.preDelete': { id: string };
    'user.created': User;
    'user.updated': User;
    'user.deleted': User;
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
export type { User };

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

  async updateProfile(id: string, data: UpdateUserProfileInput) {
    const user = await this.db.user.update({
      where: { id },
      data,
    });

    this.logger.debug(`User [${user.id}] updated`);
    this.event.emitDetached('user.updated', user);
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

    await this.event.emitAsync('user.preDelete', { id });

    await this.db.workspaceInvitation.deleteMany({
      where: { inviteeUserId: id },
    });
    const user = await this.db.user.delete({ where: { id } });
    this.event.emit('user.deleted', user);

    return user;
  }

  async recreateForBan(id: string) {
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
}
