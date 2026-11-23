import {
  createUnionType,
  Field,
  ID,
  InputType,
  ObjectType,
} from '@nestjs/graphql';
import type { User } from '@prisma/client';

import {
  PublicUser,
  UserSettings,
  UserSettingsInput,
  WorkspaceUser,
} from '../../models';
import { type CurrentUser } from '../auth/session';

@ObjectType()
export class UserType implements CurrentUser {
  @Field(() => ID)
  id!: string;

  @Field({ description: 'User name' })
  name!: string;

  @Field({ description: 'User email' })
  email!: string;

  @Field(() => String, { description: 'User avatar url', nullable: true })
  avatarUrl!: string | null;

  @Field(() => Boolean, {
    description: 'User email verified',
  })
  emailVerified!: boolean;

  @Field(() => Boolean, {
    description: 'User password has been set',
    nullable: true,
  })
  hasPassword!: boolean | null;

  @Field(() => Date, {
    deprecationReason: 'useless',
    description: 'User email verified',
    nullable: true,
  })
  createdAt?: Date | null;

  @Field(() => Boolean, {
    description: 'User is disabled',
  })
  disabled!: boolean;
}

@ObjectType()
export class PublicUserType implements PublicUser {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field(() => String, { nullable: true })
  avatarUrl!: string | null;
}

@ObjectType()
export class WorkspaceUserType implements WorkspaceUser {
  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  email!: string;

  @Field(() => String, { nullable: true })
  avatarUrl!: string | null;
}

@ObjectType()
export class LimitedUserType implements Partial<User> {
  @Field({ description: 'User email' })
  email!: string;

  @Field(() => Boolean, {
    description: 'User password has been set',
    nullable: true,
  })
  hasPassword!: boolean | null;
}

export const UserOrLimitedUser = createUnionType({
  name: 'UserOrLimitedUser',
  types: () => [UserType, LimitedUserType] as const,
  resolveType(value) {
    if (value.id) {
      return UserType;
    }
    return LimitedUserType;
  },
});

@ObjectType()
export class DeleteAccount {
  @Field()
  success!: boolean;
}
@ObjectType()
export class RemoveAvatar {
  @Field()
  success!: boolean;
}

@ObjectType()
export class UserSettingsType implements UserSettings {
  @Field({ description: 'Receive invitation email' })
  receiveInvitationEmail!: boolean;

  @Field({ description: 'Receive mention email' })
  receiveMentionEmail!: boolean;

  @Field({ description: 'Receive comment email' })
  receiveCommentEmail!: boolean;
}

@InputType()
export class UpdateUserInput implements Partial<User> {
  @Field({ description: 'User name', nullable: true })
  name?: string;
}

@InputType()
export class ManageUserInput {
  @Field({ description: 'User email', nullable: true })
  email?: string;

  @Field({ description: 'User name', nullable: true })
  name?: string;
}

@InputType()
export class UpdateUserSettingsInput implements UserSettingsInput {
  @Field({ description: 'Receive invitation email', nullable: true })
  receiveInvitationEmail?: boolean;

  @Field({ description: 'Receive mention email', nullable: true })
  receiveMentionEmail?: boolean;

  @Field({ description: 'Receive comment email', nullable: true })
  receiveCommentEmail?: boolean;
}
