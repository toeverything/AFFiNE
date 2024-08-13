import {
  createUnionType,
  Field,
  ID,
  InputType,
  ObjectType,
} from '@nestjs/graphql';
import type { User } from '@prisma/client';

import type { Payload } from '../../fundamentals/event/def';
import { CurrentUser } from '../auth/current-user';

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

@InputType()
export class UpdateUserInput implements Partial<User> {
  @Field({ description: 'User name', nullable: true })
  name?: string;
}

@InputType()
export class ManageUserInput {
  @Field({ description: 'User name', nullable: true })
  name?: string;

  @Field({ description: 'User email' })
  email!: string;
}

declare module '../../fundamentals/event/def' {
  interface UserEvents {
    admin: {
      created: Payload<{ id: string }>;
    };
  }
}
