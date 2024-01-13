import { BadRequestException, HttpStatus, UseGuards } from '@nestjs/common';
import {
  Args,
  Int,
  Mutation,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type { User } from '@prisma/client';
import { GraphQLError } from 'graphql';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import {
  CloudThrottlerGuard,
  EventEmitter,
  type FileUpload,
  PrismaService,
  Throttle,
} from '../../fundamentals';
import { Auth, CurrentUser, Public, Publicable } from '../auth/guard';
import { FeatureManagementService } from '../features';
import { QuotaService } from '../quota';
import { AvatarStorage } from '../storage';
import {
  DeleteAccount,
  RemoveAvatar,
  UserOrLimitedUser,
  UserQuotaType,
  UserType,
} from './types';
import { UsersService } from './users';

/**
 * User resolver
 * All op rate limit: 10 req/m
 */
@UseGuards(CloudThrottlerGuard)
@Auth()
@Resolver(() => UserType)
export class UserResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: AvatarStorage,
    private readonly users: UsersService,
    private readonly feature: FeatureManagementService,
    private readonly quota: QuotaService,
    private readonly event: EventEmitter
  ) {}

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Publicable()
  @Query(() => UserType, {
    name: 'currentUser',
    description: 'Get current user',
    nullable: true,
  })
  async currentUser(@CurrentUser() user?: UserType) {
    if (!user) {
      return null;
    }

    const storedUser = await this.users.findUserById(user.id);
    if (!storedUser) {
      throw new BadRequestException(`User ${user.id} not found in db`);
    }
    return {
      id: storedUser.id,
      name: storedUser.name,
      email: storedUser.email,
      emailVerified: storedUser.emailVerified,
      avatarUrl: storedUser.avatarUrl,
      createdAt: storedUser.createdAt,
      hasPassword: !!storedUser.password,
    };
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Query(() => UserOrLimitedUser, {
    name: 'user',
    description: 'Get user by email',
    nullable: true,
  })
  @Public()
  async user(
    @CurrentUser() currentUser?: UserType,
    @Args('email') email?: string
  ) {
    if (!email || !(await this.feature.canEarlyAccess(email))) {
      return new GraphQLError(
        `You don't have early access permission\nVisit https://community.affine.pro/c/insider-general/ for more information`,
        {
          extensions: {
            status: HttpStatus[HttpStatus.PAYMENT_REQUIRED],
            code: HttpStatus.PAYMENT_REQUIRED,
          },
        }
      );
    }

    // TODO: need to limit a user can only get another user witch is in the same workspace
    const user = await this.users.findUserByEmail(email);
    if (currentUser) return user;

    // return empty response when user not exists
    if (!user) return null;

    // only return limited info when not logged in
    return {
      email: user?.email,
      hasPassword: !!user?.password,
    };
  }

  @Throttle({ default: { limit: 10, ttl: 60 } })
  @ResolveField(() => UserQuotaType, { name: 'quota', nullable: true })
  async getQuota(@CurrentUser() me: User) {
    const quota = await this.quota.getUserQuota(me.id);

    return quota.feature;
  }

  @Throttle({ default: { limit: 10, ttl: 60 } })
  @ResolveField(() => Int, {
    name: 'invoiceCount',
    description: 'Get user invoice count',
  })
  async invoiceCount(@CurrentUser() user: UserType) {
    return this.prisma.userInvoice.count({
      where: { userId: user.id },
    });
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Mutation(() => UserType, {
    name: 'uploadAvatar',
    description: 'Upload user avatar',
  })
  async uploadAvatar(
    @CurrentUser() user: UserType,
    @Args({ name: 'avatar', type: () => GraphQLUpload })
    avatar: FileUpload
  ) {
    if (!user) {
      throw new BadRequestException(`User not found`);
    }

    const link = await this.storage.put(
      `${user.id}-avatar`,
      avatar.createReadStream(),
      {
        contentType: avatar.mimetype,
      }
    );

    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        avatarUrl: link,
      },
    });
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Mutation(() => RemoveAvatar, {
    name: 'removeAvatar',
    description: 'Remove user avatar',
  })
  async removeAvatar(@CurrentUser() user: UserType) {
    if (!user) {
      throw new BadRequestException(`User not found`);
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: null },
    });
    return { success: true };
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Mutation(() => DeleteAccount)
  async deleteAccount(@CurrentUser() user: UserType): Promise<DeleteAccount> {
    const deletedUser = await this.users.deleteUser(user.id);
    this.event.emit('user.deleted', deletedUser);
    return { success: true };
  }
}
