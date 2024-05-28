import { BadRequestException } from '@nestjs/common';
import {
  Args,
  Int,
  Mutation,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { PrismaClient } from '@prisma/client';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';
import { isNil, omitBy } from 'lodash-es';

import type { FileUpload } from '../../fundamentals';
import { EventEmitter, Throttle } from '../../fundamentals';
import { CurrentUser } from '../auth/current-user';
import { Public } from '../auth/guard';
import { sessionUser } from '../auth/service';
import { AvatarStorage } from '../storage';
import { validators } from '../utils/validators';
import { UserService } from './service';
import {
  DeleteAccount,
  RemoveAvatar,
  UpdateUserInput,
  UserOrLimitedUser,
  UserType,
} from './types';

@Resolver(() => UserType)
export class UserResolver {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: AvatarStorage,
    private readonly users: UserService,
    private readonly event: EventEmitter
  ) {}

  @Throttle('strict')
  @Query(() => UserOrLimitedUser, {
    name: 'user',
    description: 'Get user by email',
    nullable: true,
  })
  @Public()
  async user(
    @Args('email') email: string,
    @CurrentUser() currentUser?: CurrentUser
  ): Promise<typeof UserOrLimitedUser | null> {
    validators.assertValidEmail(email);

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

  @ResolveField(() => Int, {
    name: 'invoiceCount',
    description: 'Get user invoice count',
  })
  async invoiceCount(@CurrentUser() user: CurrentUser) {
    return this.prisma.userInvoice.count({
      where: { userId: user.id },
    });
  }

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

    const avatarUrl = await this.storage.put(
      `${user.id}-avatar`,
      avatar.createReadStream(),
      {
        contentType: avatar.mimetype,
      }
    );

    return this.users.updateUser(user.id, { avatarUrl });
  }

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

    return sessionUser(await this.users.updateUser(user.id, input));
  }

  @Mutation(() => RemoveAvatar, {
    name: 'removeAvatar',
    description: 'Remove user avatar',
  })
  async removeAvatar(@CurrentUser() user: CurrentUser) {
    if (!user) {
      throw new BadRequestException(`User not found`);
    }
    await this.users.updateUser(user.id, { avatarUrl: null });
    return { success: true };
  }

  @Mutation(() => DeleteAccount)
  async deleteAccount(
    @CurrentUser() user: CurrentUser
  ): Promise<DeleteAccount> {
    const deletedUser = await this.users.deleteUser(user.id);
    this.event.emit('user.deleted', deletedUser);
    return { success: true };
  }
}
