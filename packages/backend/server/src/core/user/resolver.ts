import { BadRequestException, UseGuards } from '@nestjs/common';
import {
  Args,
  Int,
  Mutation,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { PrismaClient, type User } from '@prisma/client';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';
import { isNil, omitBy } from 'lodash-es';

import {
  CloudThrottlerGuard,
  EventEmitter,
  type FileUpload,
  PaymentRequiredException,
  Throttle,
} from '../../fundamentals';
import { CurrentUser } from '../auth/current-user';
import { Public } from '../auth/guard';
import { sessionUser } from '../auth/service';
import { FeatureManagementService } from '../features';
import { QuotaService } from '../quota';
import { AvatarStorage } from '../storage';
import { UserService } from './service';
import {
  DeleteAccount,
  RemoveAvatar,
  UpdateUserInput,
  UserOrLimitedUser,
  UserQuotaType,
  UserType,
} from './types';

/**
 * User resolver
 * All op rate limit: 10 req/m
 */
@UseGuards(CloudThrottlerGuard)
@Resolver(() => UserType)
export class UserResolver {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: AvatarStorage,
    private readonly users: UserService,
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
  @Query(() => UserOrLimitedUser, {
    name: 'user',
    description: 'Get user by email',
    nullable: true,
  })
  @Public()
  async user(
    @CurrentUser() currentUser?: CurrentUser,
    @Args('email') email?: string
  ): Promise<typeof UserOrLimitedUser | null> {
    if (!email || !(await this.feature.canEarlyAccess(email))) {
      throw new PaymentRequiredException(
        `You don't have early access permission\nVisit https://community.affine.pro/c/insider-general/ for more information`
      );
    }

    // TODO: need to limit a user can only get another user witch is in the same workspace
    const user = await this.users.findUserWithHashedPasswordByEmail(email);

    // return empty response when user not exists
    if (!user) return null;

    if (currentUser) {
      return sessionUser(user);
    }

    // only return limited info when not logged in
    return {
      email: user.email,
      hasPassword: !!user.password,
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
  async invoiceCount(@CurrentUser() user: CurrentUser) {
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
    @CurrentUser() user: CurrentUser,
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
  @Mutation(() => UserType, {
    name: 'updateProfile',
  })
  async updateUserProfile(
    @CurrentUser() user: CurrentUser,
    @Args('input', { type: () => UpdateUserInput }) input: UpdateUserInput
  ): Promise<UserType> {
    input = omitBy(input, isNil);

    if (Object.keys(input).length === 0) {
      return user;
    }

    return sessionUser(
      await this.prisma.user.update({
        where: { id: user.id },
        data: input,
      })
    );
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
  async removeAvatar(@CurrentUser() user: CurrentUser) {
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
  async deleteAccount(
    @CurrentUser() user: CurrentUser
  ): Promise<DeleteAccount> {
    const deletedUser = await this.users.deleteUser(user.id);
    this.event.emit('user.deleted', deletedUser);
    return { success: true };
  }
}
