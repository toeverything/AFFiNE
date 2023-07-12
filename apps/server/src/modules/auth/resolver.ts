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
import type { Request } from 'express';

import { Metrics } from '../../metrics/metrics';
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
  constructor(
    private auth: AuthService,
    private readonly metric: Metrics
  ) {}

  @ResolveField(() => TokenType)
  token(@CurrentUser() currentUser: UserType, @Parent() user: UserType) {
    this.metric.gqlRequest(1, { operation: 'token' });
    if (user !== currentUser) {
      this.metric.gqlError(1, { operation: 'token' });
      throw new ForbiddenException();
    }

    return {
      token: this.auth.sign(user),
      refresh: this.auth.refresh(user),
    };
  }

  @Mutation(() => UserType)
  async signUp(
    @Context() ctx: { req: Request },
    @Args('name') name: string,
    @Args('email') email: string,
    @Args('password') password: string
  ) {
    this.metric.gqlRequest(1, { operation: 'signUp' });
    const user = await this.auth.signUp(name, email, password);
    ctx.req.user = user;
    return user;
  }

  @Mutation(() => UserType)
  async signIn(
    @Context() ctx: { req: Request },
    @Args('email') email: string,
    @Args('password') password: string
  ) {
    this.metric.gqlRequest(1, { operation: 'signIn' });
    const user = await this.auth.signIn(email, password);
    ctx.req.user = user;
    return user;
  }
}
