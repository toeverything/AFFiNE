import { Args, Field, ID, ObjectType, Query, Resolver } from '@nestjs/graphql';
import type { users } from '@prisma/client';

import { PrismaService } from '../../prisma/service';

@ObjectType()
export class User implements users {
  @Field(() => ID)
  id!: string;
  @Field({ description: 'User name' })
  name!: string;
  @Field({ description: 'User email' })
  email!: string;
  @Field({ description: 'User password', nullable: true })
  password!: string;
  @Field({ description: 'User avatar url', nullable: true })
  avatar_url!: string;
  @Field({ description: 'User token nonce', nullable: true })
  token_nonce!: number;
  @Field({ description: 'User created date', nullable: true })
  created_at!: Date;
}

@Resolver(() => User)
export class UserResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => User, {
    name: 'user',
    description: 'Get user by email',
  })
  async user(@Args('email') email: string) {
    return this.prisma.users.findUnique({
      where: { email },
    });
  }
}
