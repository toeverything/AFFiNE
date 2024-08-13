import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

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
    private readonly emitter: EventEmitter
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
    const user = await this.findUserByEmail(data.email);

    if (user) {
      throw new EmailAlreadyUsed();
    }

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

  async findUserByEmail(email: string) {
    validators.assertValidEmail(email);
    return this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
      select: this.defaultUserSelect,
    });
  }

  /**
   * supposed to be used only for `Credential SignIn`
   */
  async findUserWithHashedPasswordByEmail(email: string) {
    validators.assertValidEmail(email);
    return this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    });
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
    data: Partial<
      Pick<Prisma.UserCreateInput, 'emailVerifiedAt' | 'registered'>
    >
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
          select: this.defaultUserSelect,
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
    const user = await this.prisma.user.delete({ where: { id } });
    this.emitter.emit('user.deleted', user);
  }

  @OnEvent('user.updated')
  async onUserUpdated(user: EventPayload<'user.deleted'>) {
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
