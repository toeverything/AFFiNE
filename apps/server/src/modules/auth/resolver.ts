import { ForbiddenException } from '@nestjs/common';
import {
  Args,
  Context,
  Field,
  Mutation,
  ObjectType,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { Request } from 'express';

import { UserType } from '../users/resolver';
import { CurrentUser } from './guard';
import { AuthService } from './service';

@ObjectType()
export class TokenType {
  @Field()
  token!: string;

  @Field()
  refresh!: string;
}

@Resolver(() => UserType)
export class AuthResolver {
  constructor(private auth: AuthService) {}

  @ResolveField(() => TokenType)
  token(@CurrentUser() currentUser: UserType, @Parent() user: UserType) {
    if (user !== currentUser) {
      throw new ForbiddenException();
    }

    return {
      token: this.auth.sign(user),
      // TODO: impl
      refresh: '',
    };
  }

  @Mutation(() => UserType)
  async signIn(
    @Context() ctx: { req: Request },
    @Args('email') email: string,
    @Args('password') password: string
  ) {
    const user = await this.auth.signIn(email, password);
    ctx.req.user = user;
    return user;
  }
}
