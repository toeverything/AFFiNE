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

  @Field({ nullable: true })
  sessionToken?: string;
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

  @Throttle({
    default: {
      limit: 20,
      ttl: 60,
    },
  })
  @ResolveField(() => TokenType)
  async token(
    @Context() ctx: { req: Request },
    @CurrentUser() currentUser: UserType,
    @Parent() user: UserType
  ) {
    if (user.id !== currentUser.id) {
      throw new BadRequestException('Invalid user');
    }

    let sessionToken: string | undefined;

    // only return session if the request is from the same origin & path == /open-app
    if (
      ctx.req.headers.referer &&
      ctx.req.headers.host &&
      new URL(ctx.req.headers.referer).pathname.startsWith('/open-app') &&
      ctx.req.headers.host === new URL(this.config.origin).host
    ) {
      const cookiePrefix = this.config.node.prod ? '__Secure-' : '';
      const sessionCookieName = `${cookiePrefix}next-auth.session-token`;
      sessionToken = ctx.req.cookies?.[sessionCookieName];
    }

    return {
      sessionToken,
      token: this.auth.sign(user),
      refresh: this.auth.refresh(user),
    };
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
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

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
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

  @Throttle({
    default: {
      limit: 5,
      ttl: 60,
    },
  })
  @Mutation(() => UserType)
  @Auth()
  async changePassword(
    @CurrentUser() user: UserType,
    @Args('token') token: string,
    @Args('newPassword') newPassword: string
  ) {
    const id = await this.session.get(token);
    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify the email first');
    }
    if (
      !id ||
      (id !== user.id &&
        // change password after sign in with email link
        // we only create user account after user sign in with email link
        id !== user.email)
    ) {
      throw new ForbiddenException('Invalid token');
    }

    await this.auth.changePassword(user.email, newPassword);
    await this.session.delete(token);

    return user;
  }

  @Throttle({
    default: {
      limit: 5,
      ttl: 60,
    },
  })
  @Mutation(() => UserType)
  @Auth()
  async changeEmail(
    @CurrentUser() user: UserType,
    @Args('token') token: string
  ) {
    // email has set token in `sendVerifyChangeEmail`
    const [id, email] = (await this.session.get(token)).split(',');
    if (!id || id !== user.id || !email) {
      throw new ForbiddenException('Invalid token');
    }

    await this.auth.changeEmail(id, email);
    await this.session.delete(token);

    await this.auth.sendNotificationChangeEmail(email);

    return user;
  }

  @Throttle({
    default: {
      limit: 5,
      ttl: 60,
    },
  })
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

  @Throttle({
    default: {
      limit: 5,
      ttl: 60,
    },
  })
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

  // The change email step is:
  // 1. send email to primitive email `sendChangeEmail`
  // 2. user open change email page from email
  // 3. send verify email to new email `sendVerifyChangeEmail`
  // 4. user open confirm email page from new email
  // 5. user click confirm button
  // 6. send notification email
  @Throttle({
    default: {
      limit: 5,
      ttl: 60,
    },
  })
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

  @Throttle({
    default: {
      limit: 5,
      ttl: 60,
    },
  })
  @Mutation(() => Boolean)
  @Auth()
  async sendVerifyChangeEmail(
    @CurrentUser() user: UserType,
    @Args('token') token: string,
    @Args('email') email: string,
    @Args('callbackUrl') callbackUrl: string
  ) {
    const id = await this.session.get(token);
    if (!id || id !== user.id) {
      throw new ForbiddenException('Invalid token');
    }

    const hasRegistered = await this.auth.getUserByEmail(email);

    if (hasRegistered) {
      throw new BadRequestException(`Invalid user email`);
    }

    const withEmailToken = nanoid();
    await this.session.set(withEmailToken, `${user.id},${email}`);

    const url = new URL(callbackUrl, this.config.baseUrl);
    url.searchParams.set('token', withEmailToken);

    const res = await this.auth.sendVerifyChangeEmail(email, url.toString());

    await this.session.delete(token);

    return !res.rejected.length;
  }
}
