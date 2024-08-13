import {
  Args,
  Field,
  InputType,
  Int,
  Mutation,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { PrismaClient } from '@prisma/client';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';
import { isNil, omitBy } from 'lodash-es';

import { type FileUpload, Throttle, UserNotFound } from '../../fundamentals';
import { CurrentUser } from '../auth/current-user';
import { Public } from '../auth/guard';
import { sessionUser } from '../auth/service';
import { Admin } from '../common';
import { AvatarStorage } from '../storage';
import { validators } from '../utils/validators';
import { UserService } from './service';
import {
  DeleteAccount,
  ManageUserInput,
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
    private readonly users: UserService
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

    // TODO(@forehalo): need to limit a user can only get another user witch is in the same workspace
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
    if (!avatar.mimetype.startsWith('image/')) {
      throw new Error('Invalid file type');
    }

    if (!user) {
      throw new UserNotFound();
    }

    const avatarUrl = await this.storage.put(
      `${user.id}-avatar-${Date.now()}`,
      avatar.createReadStream(),
      {
        contentType: avatar.mimetype,
      }
    );

    if (user.avatarUrl) {
      await this.storage.delete(user.avatarUrl);
    }

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
      throw new UserNotFound();
    }
    await this.users.updateUser(user.id, { avatarUrl: null });
    return { success: true };
  }

  @Mutation(() => DeleteAccount)
  async deleteAccount(
    @CurrentUser() user: CurrentUser
  ): Promise<DeleteAccount> {
    await this.users.deleteUser(user.id);
    return { success: true };
  }
}

@InputType()
class ListUserInput {
  @Field(() => Int, { nullable: true, defaultValue: 0 })
  skip!: number;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  first!: number;
}

@InputType()
class CreateUserInput {
  @Field(() => String)
  email!: string;

  @Field(() => String, { nullable: true })
  name!: string | null;

  @Field(() => String, { nullable: true })
  password!: string | null;
}

@Admin()
@Resolver(() => UserType)
export class UserManagementResolver {
  constructor(
    private readonly db: PrismaClient,
    private readonly user: UserService
  ) {}

  @Query(() => Int, {
    description: 'Get users count',
  })
  async usersCount(): Promise<number> {
    return this.db.user.count();
  }

  @Query(() => [UserType], {
    description: 'List registered users',
  })
  async users(
    @Args({ name: 'filter', type: () => ListUserInput }) input: ListUserInput
  ): Promise<UserType[]> {
    const users = await this.db.user.findMany({
      select: { ...this.user.defaultUserSelect, password: true },
      skip: input.skip,
      take: input.first,
    });

    return users.map(sessionUser);
  }

  @Query(() => UserType, {
    name: 'userById',
    description: 'Get user by id',
  })
  async getUser(@Args('id') id: string) {
    const user = await this.db.user.findUnique({
      select: { ...this.user.defaultUserSelect, password: true },
      where: {
        id,
      },
    });

    if (!user) {
      return null;
    }

    return sessionUser(user);
  }

  @Query(() => UserType, {
    name: 'userByEmail',
    description: 'Get user by email for admin',
    nullable: true,
  })
  async getUserByEmail(@Args('email') email: string) {
    const user = await this.db.user.findUnique({
      select: { ...this.user.defaultUserSelect, password: true },
      where: {
        email,
      },
    });

    if (!user) {
      return null;
    }

    return sessionUser(user);
  }

  @Mutation(() => UserType, {
    description: 'Create a new user',
  })
  async createUser(
    @Args({ name: 'input', type: () => CreateUserInput }) input: CreateUserInput
  ) {
    const { id } = await this.user.createUser({
      email: input.email,
      password: input.password,
      registered: true,
    });

    // data returned by `createUser` does not satisfies `UserType`
    return this.getUser(id);
  }

  @Mutation(() => DeleteAccount, {
    description: 'Delete a user account',
  })
  async deleteUser(@Args('id') id: string): Promise<DeleteAccount> {
    await this.user.deleteUser(id);
    return { success: true };
  }

  @Mutation(() => UserType, {
    description: 'Update a user',
  })
  async updateUser(
    @Args('id') id: string,
    @Args('input') input: ManageUserInput
  ): Promise<UserType> {
    const user = await this.db.user.findUnique({
      select: { ...this.user.defaultUserSelect, password: true },
      where: { id },
    });

    if (!user) {
      throw new UserNotFound();
    }
    validators.assertValidEmail(input.email);
    if (input.email !== user.email) {
      const exists = await this.db.user.findFirst({
        where: { email: input.email },
      });
      if (exists) {
        throw new Error('Email already exists');
      }
    }
    return sessionUser(
      await this.user.updateUser(user.id, {
        name: input.name,
        email: input.email,
      })
    );
  }
}
