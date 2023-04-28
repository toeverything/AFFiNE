import { Args, Field, ID, ObjectType, Query, Resolver } from '@nestjs/graphql';
import type { User } from '@prisma/client';

import { PrismaService } from '../../prisma/service';

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

@Resolver(() => UserType)
export class UserResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => UserType, {
    name: 'user',
    description: 'Get user by email',
  })
  async user(@Args('email') email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }
}
