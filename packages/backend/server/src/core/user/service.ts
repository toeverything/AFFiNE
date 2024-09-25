import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient, User } from '@prisma/client';

import {
  Config,
  CryptoHelper,
  EmailAlreadyUsed,
  EventEmitter,
  type EventPayload,
  OnEvent,
  WrongSignInCredentials,
  WrongSignInMethod,
} from '../../fundamentals';
import { PermissionService } from '../permission';
import { Quota_FreePlanV1_1 } from '../quota/schema';
import { validators } from '../utils/validators';

type CreateUserInput = Omit<Prisma.UserCreateInput, 'name'> & { name?: string };

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  defaultUserSelect = {
    id: true,
    name: true,
    email: true,
    emailVerifiedAt: true,
    avatarUrl: true,
    registered: true,
    createdAt: true,
  } satisfies Prisma.UserSelect;

  constructor(
    private readonly config: Config,
    private readonly crypto: CryptoHelper,
    private readonly prisma: PrismaClient,
    private readonly emitter: EventEmitter,
    private readonly permission: PermissionService
  ) {}

  get userCreatingData() {
    return {
      name: 'Unnamed',
      features: {
        create: {
          reason: 'sign up',
          activated: true,
          feature: {
            connect: {
              feature_version: Quota_FreePlanV1_1,
            },
          },
        },
      },
    };
  }

  async createUser(data: CreateUserInput) {
    validators.assertValidEmail(data.email);

    if (data.password) {
      const config = await this.config.runtime.fetchAll({
        'auth/password.max': true,
        'auth/password.min': true,
      });
      validators.assertValidPassword(data.password, {
        max: config['auth/password.max'],
        min: config['auth/password.min'],
      });
    }

    return this.createUser_without_verification(data);
  }

  async createUser_without_verification(data: CreateUserInput) {
    const user = await this.findUserByEmail(data.email);

    if (user) {
      throw new EmailAlreadyUsed();
    }

    if (data.password) {
      data.password = await this.crypto.encryptPassword(data.password);
    }

    if (!data.name) {
      data.name = data.email.split('@')[0];
    }

    return this.prisma.user.create({
      select: this.defaultUserSelect,
      data: {
        ...this.userCreatingData,
        ...data,
      },
    });
  }

  async findUserById(id: string) {
    return this.prisma.user
      .findUnique({
        where: { id },
        select: this.defaultUserSelect,
      })
      .catch(() => {
        return null;
      });
  }

  async findUserByEmail(
    email: string
  ): Promise<Pick<User, keyof typeof this.defaultUserSelect> | null> {
    validators.assertValidEmail(email);
    const rows = await this.prisma.$queryRaw<
      // see [this.defaultUserSelect]
      {
        id: string;
        name: string;
        email: string;
        email_verified: Date | null;
        avatar_url: string | null;
        registered: boolean;
        created_at: Date;
      }[]
    >`
      SELECT "id", "name", "email", "email_verified", "avatar_url", "registered", "created_at"
      FROM "users"
      WHERE lower("email") = lower(${email})
    `;

    const user = rows[0];

    if (!user) {
      return null;
    }

    return {
      ...user,
      emailVerifiedAt: user.email_verified,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    };
  }

  /**
   * supposed to be used only for `Credential SignIn`
   */
  async findUserWithHashedPasswordByEmail(email: string): Promise<User | null> {
    validators.assertValidEmail(email);

    // see https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries#typing-queryraw-results
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        email: string;
        password: string | null;
        email_verified: Date | null;
        avatar_url: string | null;
        registered: boolean;
        created_at: Date;
      }[]
    >`
      SELECT *
      FROM "users"
      WHERE lower("email") = lower(${email})
    `;

    const user = rows[0];
    if (!user) {
      return null;
    }

    return {
      ...user,
      emailVerifiedAt: user.email_verified,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
    };
  }

  async signIn(email: string, password: string) {
    const user = await this.findUserWithHashedPasswordByEmail(email);

    if (!user) {
      throw new WrongSignInCredentials();
    }

    if (!user.password) {
      throw new WrongSignInMethod();
    }

    const passwordMatches = await this.crypto.verifyPassword(
      password,
      user.password
    );

    if (!passwordMatches) {
      throw new WrongSignInCredentials();
    }

    return user;
  }

  async fulfillUser(
    email: string,
    data: Omit<Partial<Prisma.UserCreateInput>, 'id'>
  ) {
    const user = await this.findUserByEmail(email);
    if (!user) {
      return this.createUser({
        ...this.userCreatingData,
        email,
        name: email.split('@')[0],
        ...data,
      });
    } else {
      if (user.registered) {
        delete data.registered;
      }
      if (user.emailVerifiedAt) {
        delete data.emailVerifiedAt;
      }

      if (Object.keys(data).length) {
        return await this.prisma.user.update({
          where: { id: user.id },
          data,
        });
      }
    }

    this.emitter.emit('user.updated', user);

    return user;
  }

  async updateUser(
    id: string,
    data: Omit<Partial<Prisma.UserCreateInput>, 'id'>,
    select: Prisma.UserSelect = this.defaultUserSelect
  ) {
    if (data.password) {
      const config = await this.config.runtime.fetchAll({
        'auth/password.max': true,
        'auth/password.min': true,
      });
      validators.assertValidPassword(data.password, {
        max: config['auth/password.max'],
        min: config['auth/password.min'],
      });

      data.password = await this.crypto.encryptPassword(data.password);
    }

    if (data.email) {
      validators.assertValidEmail(data.email);
      const emailTaken = await this.prisma.user.count({
        where: {
          email: data.email,
          id: {
            not: id,
          },
        },
      });

      if (emailTaken) {
        throw new EmailAlreadyUsed();
      }
    }

    const user = await this.prisma.user.update({ where: { id }, data, select });

    this.emitter.emit('user.updated', user);

    return user;
  }

  async deleteUser(id: string) {
    const ownedWorkspaces = await this.permission.getOwnedWorkspaces(id);
    const user = await this.prisma.user.delete({ where: { id } });
    this.emitter.emit('user.deleted', { ...user, ownedWorkspaces });
  }

  @OnEvent('user.updated')
  async onUserUpdated(user: EventPayload<'user.updated'>) {
    const { enabled, customerIo } = this.config.metrics;
    if (enabled && customerIo?.token) {
      const payload = {
        name: user.name,
        email: user.email,
        created_at: Number(user.createdAt) / 1000,
      };
      try {
        await fetch(`https://track.customer.io/api/v1/customers/${user.id}`, {
          method: 'PUT',
          headers: {
            Authorization: `Basic ${customerIo.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      } catch (e) {
        this.logger.error('Failed to publish user update event:', e);
      }
    }
  }

  @OnEvent('user.deleted')
  async onUserDeleted(user: EventPayload<'user.deleted'>) {
    const { enabled, customerIo } = this.config.metrics;
    if (enabled && customerIo?.token) {
      try {
        if (user.emailVerifiedAt) {
          // suppress email if email is verified
          await fetch(
            `https://track.customer.io/api/v1/customers/${user.email}/suppress`,
            {
              method: 'POST',
              headers: {
                Authorization: `Basic ${customerIo.token}`,
              },
            }
          );
        }
        await fetch(`https://track.customer.io/api/v1/customers/${user.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Basic ${customerIo.token}` },
        });
      } catch (e) {
        this.logger.error('Failed to publish user delete event:', e);
      }
    }
  }
}
