import {
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Mutation,
  ObjectType,
  Query,
  registerEnumType,
  Resolver,
} from '@nestjs/graphql';
import type { User } from '@prisma/client';
// @ts-expect-error graphql-upload is not typed
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import { Config } from '../../config';
import { PrismaService } from '../../prisma/service';
import type { FileUpload } from '../../types';
import { Auth, CurrentUser, Public } from '../auth/guard';
import { StorageService } from '../storage/storage.service';
import { NewFeaturesKind } from './types';

registerEnumType(NewFeaturesKind, {
  name: 'NewFeaturesKind',
});

@ObjectType()
export class UserType implements Partial<User> {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'User name' })
  name!: string;

  @Field({ description: 'User email' })
  email!: string;

  @Field(() => String, { description: 'User avatar url', nullable: true })
  avatarUrl: string | null = null;

  @Field(() => Date, { description: 'User email verified', nullable: true })
  emailVerified: Date | null = null;

  @Field({ description: 'User created date', nullable: true })
  createdAt!: Date;

  @Field(() => Boolean, {
    description: 'User password has been set',
    nullable: true,
  })
  hasPassword?: boolean;
}

@ObjectType()
export class DeleteAccount {
  @Field()
  success!: boolean;
}

@ObjectType()
export class AddToNewFeaturesWaitingList {
  @Field()
  email!: string;
  @Field(() => NewFeaturesKind, { description: 'New features kind' })
  type!: NewFeaturesKind;
}

@Auth()
@Resolver(() => UserType)
export class UserResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: Config
  ) {}

  @Query(() => UserType, {
    name: 'currentUser',
    description: 'Get current user',
  })
  async currentUser(@CurrentUser() user: User) {
    const storedUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
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

  @Query(() => UserType, {
    name: 'user',
    description: 'Get user by email',
    nullable: true,
  })
  @Public()
  async user(@Args('email') email: string) {
    if (this.config.node.prod && this.config.affine.beta) {
      const hasEarlyAccess = await this.prisma.newFeaturesWaitingList
        .findUnique({
          where: { email, type: NewFeaturesKind.EarlyAccess },
        })
        .catch(() => false);
      if (!hasEarlyAccess) {
        return new HttpException(
          `You don't have early access permission\nVisit https://community.affine.pro/c/insider-general/ for more information`,
          401
        );
      }
    }
    // TODO: need to limit a user can only get another user witch is in the same workspace
    const user = await this.prisma.user
      .findUnique({
        where: { email },
      })
      .catch(() => {
        return null;
      });
    if (user?.password) {
      const userResponse: UserType = user;
      userResponse.hasPassword = true;
    }
    return user;
  }

  @Mutation(() => UserType, {
    name: 'uploadAvatar',
    description: 'Upload user avatar',
  })
  async uploadAvatar(
    @Args('id') id: string,
    @Args({ name: 'avatar', type: () => GraphQLUpload })
    avatar: FileUpload
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new BadRequestException(`User ${id} not found`);
    }
    const url = await this.storage.uploadFile(`${id}-avatar`, avatar);
    return this.prisma.user.update({
      where: { id },
      data: { avatarUrl: url },
    });
  }

  @Mutation(() => DeleteAccount)
  async deleteAccount(@CurrentUser() user: UserType): Promise<DeleteAccount> {
    await this.prisma.user.delete({
      where: {
        id: user.id,
      },
    });
    await this.prisma.session.deleteMany({
      where: {
        userId: user.id,
      },
    });
    return {
      success: true,
    };
  }

  @Mutation(() => AddToNewFeaturesWaitingList)
  async addToNewFeaturesWaitingList(
    @CurrentUser() user: UserType,
    @Args('type', {
      type: () => NewFeaturesKind,
    })
    type: NewFeaturesKind,
    @Args('email') email: string
  ): Promise<AddToNewFeaturesWaitingList> {
    if (!user.email.endsWith('@toeverything.info')) {
      throw new ForbiddenException('You are not allowed to do this');
    }
    await this.prisma.newFeaturesWaitingList.create({
      data: {
        email,
        type,
      },
    });
    return {
      email,
      type,
    };
  }
}
