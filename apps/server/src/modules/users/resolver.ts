import { UploadedFile, UseInterceptors } from '@nestjs/common';
import {
  Args,
  Field,
  ID,
  Mutation,
  ObjectType,
  Query,
  Resolver,
} from '@nestjs/graphql';
import { FileInterceptor } from '@nestjs/platform-express/multer';
import type { User } from '@prisma/client';
import { memoryStorage } from 'multer';

import { PrismaService } from '../../prisma/service';
import { Auth } from '../auth/guard';
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
    name: 'user',
    description: 'Get user by email',
  })
  async user(@Args('email') email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  @Mutation(() => UserType, {
    name: 'uploadAvatar',
    description: 'Upload user avatar',
  })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 1024 * 1024 * 10, files: 1 },
    })
  )
  async uploadAvatar(
    @Args('id') id: string,
    @UploadedFile() file: Express.Multer.File
  ) {
    const url = await this.storage.uploadFile(`avatars/${id}`, file.buffer);
    return this.prisma.user.update({
      where: { id },
      data: { avatarUrl: url },
    });
  }
}
