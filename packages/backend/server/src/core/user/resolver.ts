import {
  Args,
  createUnionType,
  Field,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { PrismaClient } from '@prisma/client';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';
import { isNil, omitBy } from 'lodash-es';

import {
  CannotDeleteOwnAccount,
  type FileUpload,
  readBufferWithLimit,
  sniffMime,
  Throttle,
  UserNotFound,
} from '../../base';
import {
  Feature,
  Models,
  UserFeatureName,
  UserSettingsSchema,
} from '../../models';
import { Public } from '../auth/guard';
import { sessionUser } from '../auth/service';
import { CurrentUser } from '../auth/session';
import { Admin } from '../common';
import { AvatarStorage } from '../storage';
import { validators } from '../utils/validators';
import {
  DeleteAccount,
  ManageUserInput,
  PublicUserType,
  RemoveAvatar,
  UpdateUserInput,
  UpdateUserSettingsInput,
  UserOrLimitedUser,
  UserSettingsType,
  UserType,
} from './types';

@Resolver(() => UserType)
export class UserResolver {
  constructor(
    private readonly storage: AvatarStorage,
    private readonly models: Models
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
    const user = await this.models.user.getUserByEmail(email);

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

  @Throttle('strict')
  @Query(() => PublicUserType, {
    name: 'publicUserById',
    description: 'Get public user by id',
    nullable: true,
  })
  @Public()
  async getPublicUserById(
    @Args('id', { type: () => String }) id: string
  ): Promise<PublicUserType | null> {
    return await this.models.user.getPublicUser(id);
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
      throw new UserNotFound();
    }

    const avatarBuffer = await readBufferWithLimit(avatar.createReadStream());
    const contentType = sniffMime(avatarBuffer, avatar.mimetype);
    if (!contentType || !contentType.startsWith('image/')) {
      throw new Error(`Invalid file type: ${contentType || 'unknown'}`);
    }

    const avatarUrl = await this.storage.put(
      `${user.id}-avatar-${Date.now()}`,
      avatarBuffer,
      { contentType }
    );

    if (user.avatarUrl) {
      await this.storage.delete(user.avatarUrl);
    }

    return this.models.user.update(user.id, { avatarUrl });
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

    return sessionUser(await this.models.user.update(user.id, input));
  }

  @Mutation(() => RemoveAvatar, {
    name: 'removeAvatar',
    description: 'Remove user avatar',
  })
  async removeAvatar(@CurrentUser() user: CurrentUser) {
    if (!user) {
      throw new UserNotFound();
    }
    await this.models.user.update(user.id, { avatarUrl: null });
    return { success: true };
  }

  @Mutation(() => DeleteAccount)
  async deleteAccount(
    @CurrentUser() user: CurrentUser
  ): Promise<DeleteAccount> {
    await this.models.user.delete(user.id);
    return { success: true };
  }
}

@Resolver(() => UserType)
export class UserSettingsResolver {
  constructor(private readonly models: Models) {}

  @Mutation(() => Boolean, {
    name: 'updateSettings',
    description: 'Update user settings',
  })
  async updateSettings(
    @CurrentUser() user: CurrentUser,
    @Args('input', { type: () => UpdateUserSettingsInput })
    input: UpdateUserSettingsInput
  ) {
    UserSettingsSchema.parse(input);
    await this.models.userSettings.set(user.id, input);
    return true;
  }

  @ResolveField(() => UserSettingsType, {
    name: 'settings',
    description: 'Get user settings',
  })
  async getSettings(@CurrentUser() me: CurrentUser): Promise<UserSettingsType> {
    return await this.models.userSettings.get(me.id);
  }
}

@InputType()
class ListUserInput {
  @Field(() => Int, { nullable: true, defaultValue: 0 })
  skip!: number;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  first!: number;

  @Field(() => String, { nullable: true })
  keyword?: string;

  @Field(() => [Feature], { nullable: true })
  features?: Feature[];
}

@InputType()
class CreateUserInput {
  @Field(() => String)
  email!: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  password?: string;
}

@InputType()
class ImportUsersInput {
  @Field(() => [CreateUserInput])
  users!: CreateUserInput[];
}

@ObjectType()
class UserImportFailedType {
  @Field(() => String)
  email!: string;

  @Field(() => String)
  error!: string;
}

const UserImportResultType = createUnionType({
  name: 'UserImportResultType',
  types: () => [UserType, UserImportFailedType],
  resolveType: val => {
    return 'error' in val ? UserImportFailedType : UserType;
  },
});

@Admin()
@Resolver(() => UserType)
export class UserManagementResolver {
  constructor(
    private readonly db: PrismaClient,
    private readonly models: Models
  ) {}

  @Query(() => Int, {
    description: 'Get users count',
  })
  async usersCount(
    @Args({ name: 'filter', type: () => ListUserInput, nullable: true })
    input?: ListUserInput
  ): Promise<number> {
    return this.models.user.count({
      keyword: input?.keyword ?? null,
      features: (input?.features as UserFeatureName[]) ?? null,
    });
  }

  @Query(() => [UserType], {
    description: 'List registered users',
  })
  async users(
    @Args({ name: 'filter', type: () => ListUserInput }) input: ListUserInput
  ): Promise<UserType[]> {
    const users = await this.models.user.list({
      skip: input.skip,
      take: input.first,
      keyword: input.keyword,
      features: input.features as UserFeatureName[],
    });

    return users.map(sessionUser);
  }

  @Query(() => UserType, {
    name: 'userById',
    description: 'Get user by id',
  })
  async getUser(@Args('id') id: string) {
    const user = await this.models.user.get(id, {
      withDisabled: true,
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
    const user = await this.models.user.getUserByEmail(email, {
      withDisabled: true,
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
    const { id } = await this.models.user.create({
      ...input,
      registered: true,
    });

    // data returned by `createUser` does not satisfies `UserType`
    return this.getUser(id);
  }

  @Mutation(() => [UserImportResultType], {
    description: 'import users',
  })
  async importUsers(
    @Args({ name: 'input', type: () => ImportUsersInput })
    input: ImportUsersInput
  ): Promise<(typeof UserImportResultType)[]> {
    const results = await this.models.user.importUsers(input.users);

    return results.map((result, i) => {
      if (result.status === 'fulfilled') {
        return sessionUser(result.value);
      } else {
        return {
          email: input.users[i].email,
          error: result.reason.message,
        };
      }
    });
  }

  @Mutation(() => DeleteAccount, {
    description: 'Delete a user account',
  })
  async deleteUser(
    @CurrentUser() user: CurrentUser,
    @Args('id') id: string
  ): Promise<DeleteAccount> {
    if (user.id === id) {
      throw new CannotDeleteOwnAccount();
    }
    await this.models.user.delete(id);
    return { success: true };
  }

  @Mutation(() => UserType, {
    description: 'Update an user',
  })
  async updateUser(
    @Args('id') id: string,
    @Args('input') input: ManageUserInput
  ): Promise<UserType> {
    const user = await this.db.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new UserNotFound();
    }

    input = omitBy(input, isNil);
    if (Object.keys(input).length === 0) {
      return sessionUser(user);
    }

    return sessionUser(
      await this.models.user.update(user.id, {
        email: input.email,
        name: input.name,
      })
    );
  }

  @Mutation(() => UserType, {
    description: 'Ban an user',
  })
  async banUser(@Args('id') id: string): Promise<UserType> {
    return sessionUser(await this.models.user.ban(id));
  }

  @Mutation(() => UserType, {
    description: 'Reenable an banned user',
  })
  async enableUser(@Args('id') id: string): Promise<UserType> {
    return sessionUser(await this.models.user.enable(id));
  }
}
