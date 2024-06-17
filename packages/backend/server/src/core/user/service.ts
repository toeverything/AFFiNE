import { Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import {
  Config,
  EmailAlreadyUsed,
  EventEmitter,
  type EventPayload,
  OnEvent,
} from '../../fundamentals';
import { Quota_FreePlanV1_1 } from '../quota/schema';

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
    private readonly prisma: PrismaClient,
    private readonly emitter: EventEmitter
  ) {}

  get userCreatingData() {
    return {
      name: 'Unnamed',
      features: {
        create: {
          reason: 'created by invite sign up',
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

  async createUser(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({
      select: this.defaultUserSelect,
      data: {
        ...this.userCreatingData,
        ...data,
      },
    });
  }

  async createAnonymousUser(
    email: string,
    data?: Partial<Prisma.UserCreateInput>
  ) {
    const user = await this.findUserByEmail(email);

    if (user) {
      throw new EmailAlreadyUsed();
    }

    return this.createUser({
      email,
      name: email.split('@')[0],
      ...data,
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
    return this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    });
  }

  async findOrCreateUser(
    email: string,
    data?: Partial<Prisma.UserCreateInput>
  ) {
    const user = await this.findUserByEmail(email);
    if (user) {
      return user;
    }
    return this.createAnonymousUser(email, data);
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
    data: Prisma.UserUpdateInput,
    select: Prisma.UserSelect = this.defaultUserSelect
  ) {
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
