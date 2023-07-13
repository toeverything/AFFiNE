import { BadRequestException } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import type { User } from '@prisma/client';
// @ts-expect-error graphql-upload is not typed
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import { PrismaService } from '../../prisma/service';
import type { FileUpload } from '../../types';
import { Auth, CurrentUser } from '../auth/guard';
import { StorageService } from '../storage/storage.service';

@ObjectType()
export class UserType implements Partial<User> {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'User name' })
  name!: string;

  @Field({ description: 'User email' })
  email!: string;

  @Field({ description: 'User avatar url', nullable: true })
  avatarUrl!: string;

  @Field({ description: 'User email verified', nullable: true })
  emailVerified!: Date;

  @Field({ description: 'User created date', nullable: true })
  createdAt!: Date;
}

@Auth()
@Resolver(() => UserType)
export class UserResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  @Query(() => UserType, {
    name: 'currentUser',
    description: 'Get all users',
  })
  async currentUser(@CurrentUser() user: UserType) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    };
  }

  @Query(() => UserType, {
    name: 'user',
    description: 'Get user by email',
  })
  async user(@Args('email') email: string) {
    // TODO: need to limit a user can only get another user witch is in the same workspace
    return this.prisma.user.findUnique({
      where: { email },
    });
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
}
