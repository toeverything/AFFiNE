import { createUnionType, Field, ID, ObjectType } from '@nestjs/graphql';
import type { User } from '@prisma/client';
import { SafeIntResolver } from 'graphql-scalars';

@ObjectType('UserQuotaHumanReadable')
export class UserQuotaHumanReadableType {
  @Field({ name: 'name' })
  name!: string;

  @Field({ name: 'blobLimit' })
  blobLimit!: string;

  @Field({ name: 'storageQuota' })
  storageQuota!: string;

  @Field({ name: 'historyPeriod' })
  historyPeriod!: string;

  @Field({ name: 'memberLimit' })
  memberLimit!: string;
}

@ObjectType('UserQuota')
export class UserQuotaType {
  @Field({ name: 'name' })
  name!: string;

  @Field(() => SafeIntResolver, { name: 'blobLimit' })
  blobLimit!: number;

  @Field(() => SafeIntResolver, { name: 'storageQuota' })
  storageQuota!: number;

  @Field(() => SafeIntResolver, { name: 'historyPeriod' })
  historyPeriod!: number;

  @Field({ name: 'memberLimit' })
  memberLimit!: number;

  @Field({ name: 'humanReadable' })
  humanReadable!: UserQuotaHumanReadableType;
}

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
export class LimitedUserType implements Partial<User> {
  @Field({ description: 'User email' })
  email!: string;

  @Field(() => Boolean, {
    description: 'User password has been set',
    nullable: true,
  })
  hasPassword?: boolean;
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
