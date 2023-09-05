import {
  BadRequestException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
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
import { nanoid } from 'nanoid';

import { Config } from '../../config';
import { SessionService } from '../../session';
import { CloudThrottlerGuard, Throttle } from '../../throttler';
import { UserType } from '../users/resolver';
import { Auth, CurrentUser } from './guard';
import { AuthService } from './service';

@ObjectType()
export class TokenType {
  @Field()
  token!: string;

  @Field()
  refresh!: string;
}

/**
 * Auth resolver
 * Token rate limit: 20 req/m
 * Sign up/in rate limit: 10 req/m
 * Other rate limit: 5 req/m
 */
@UseGuards(CloudThrottlerGuard)
@Resolver(() => UserType)
export class AuthResolver {
  constructor(
    private readonly config: Config,
    private readonly auth: AuthService,
    private readonly session: SessionService
  ) {}

  @Throttle(20, 60)
  @ResolveField(() => TokenType)
  token(@CurrentUser() currentUser: UserType, @Parent() user: UserType) {
    if (user.id !== currentUser.id) {
      throw new BadRequestException('Invalid user');
    }

    return {
      token: this.auth.sign(user),
      refresh: this.auth.refresh(user),
    };
  }

  @Throttle(10, 60)
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

  @Throttle(10, 60)
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

  @Throttle(5, 60)
  @Mutation(() => UserType)
  @Auth()
  async changePassword(
    @CurrentUser() user: UserType,
    @Args('token') token: string,
    @Args('newPassword') newPassword: string
  ) {
    const id = await this.session.get(token);
    if (!id || id !== user.id) {
      throw new ForbiddenException('Invalid token');
    }

    await this.auth.changePassword(id, newPassword);
    await this.session.delete(token);

    return user;
  }

  @Throttle(5, 60)
  @Mutation(() => UserType)
  @Auth()
  async changeEmail(
    @CurrentUser() user: UserType,
    @Args('token') token: string,
    @Args('email') email: string
  ) {
    const id = await this.session.get(token);
    if (!id || id !== user.id) {
      throw new ForbiddenException('Invalid token');
    }

    await this.auth.changeEmail(id, email);
    await this.session.delete(token);

    return user;
  }

  @Throttle(5, 60)
  @Mutation(() => Boolean)
  @Auth()
  async sendChangePasswordEmail(
    @CurrentUser() user: UserType,
    @Args('email') email: string,
    @Args('callbackUrl') callbackUrl: string
  ) {
    const token = nanoid();
    await this.session.set(token, user.id);

    const url = new URL(callbackUrl, this.config.baseUrl);
    url.searchParams.set('token', token);

    const res = await this.auth.sendChangePasswordEmail(email, url.toString());
    return !res.rejected.length;
  }

  @Throttle(5, 60)
  @Mutation(() => Boolean)
  @Auth()
  async sendSetPasswordEmail(
    @CurrentUser() user: UserType,
    @Args('email') email: string,
    @Args('callbackUrl') callbackUrl: string
  ) {
    const token = nanoid();
    await this.session.set(token, user.id);

    const url = new URL(callbackUrl, this.config.baseUrl);
    url.searchParams.set('token', token);

    const res = await this.auth.sendSetPasswordEmail(email, url.toString());
    return !res.rejected.length;
  }

  @Throttle(5, 60)
  @Mutation(() => Boolean)
  @Auth()
  async sendChangeEmail(
    @CurrentUser() user: UserType,
    @Args('email') email: string,
    @Args('callbackUrl') callbackUrl: string
  ) {
    const token = nanoid();
    await this.session.set(token, user.id);

    const url = new URL(callbackUrl, this.config.baseUrl);
    url.searchParams.set('token', token);

    const res = await this.auth.sendChangeEmail(email, url.toString());
    return !res.rejected.length;
  }
}
