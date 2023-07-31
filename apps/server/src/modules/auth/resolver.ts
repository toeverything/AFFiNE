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

import { Config } from '../../config';
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
    private readonly config: Config,
    private auth: AuthService
  ) {}

  @ResolveField(() => TokenType)
  token(@CurrentUser() currentUser: UserType, @Parent() user: UserType) {
    if (user !== currentUser) {
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
    const user = await this.auth.signIn(email, password);
    ctx.req.user = user;
    return user;
  }

  @Mutation(() => UserType)
  async changePassword(
    @Context() ctx: { req: Request },
    @Args('email') email: string,
    @Args('password') password: string,
    @Args('newPassword') newPassword: string
  ) {
    const user = await this.auth.changePassword(email, password, newPassword);
    ctx.req.user = user;
    return user;
  }

  @Mutation(() => Boolean)
  async sendChangePasswordEmail(
    @Context() ctx: { req: Request },
    @Args('email') email: string,
    @Args('callbackUrl') callbackUrl: string
  ) {
    const url = `${this.config.baseUrl}${callbackUrl}`;
    const res = await this.auth.sendChangePasswordEmail(email, url);
    return !res.rejected.length;
  }

  @Mutation(() => Boolean)
  async sendSetPasswordEmail(
    @Context() ctx: { req: Request },
    @Args('email') email: string,
    @Args('callbackUrl') callbackUrl: string
  ) {
    const url = `${this.config.baseUrl}${callbackUrl}`;
    const res = await this.auth.sendSetPasswordEmail(email, url);
    return !res.rejected.length;
  }

  @Mutation(() => Boolean)
  async sendChangeEmail(
    @Context() ctx: { req: Request },
    @Args('email') email: string,
    @Args('callbackUrl') callbackUrl: string
  ) {
    const url = `${this.config.baseUrl}${callbackUrl}`;
    const res = await this.auth.sendChangeEmail(email, url);
    return !res.rejected.length;
  }
}
