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
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type { Request, Response } from 'express';

import { CloudThrottlerGuard, Config, Throttle } from '../../fundamentals';
import { UserType } from '../user/types';
import { validators } from '../utils/validators';
import { CurrentUser } from './current-user';
import { Public } from './guard';
import { AuthService } from './service';
import { TokenService, TokenType } from './token';

@ObjectType('tokenType')
export class ClientTokenType {
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
    private readonly token: TokenService
  ) {}

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Public()
  @Query(() => UserType, {
    name: 'currentUser',
    description: 'Get current user',
    nullable: true,
  })
  currentUser(@CurrentUser() user?: CurrentUser): UserType | undefined {
    return user;
  }

  @Throttle({
    default: {
      limit: 20,
      ttl: 60,
    },
  })
  @ResolveField(() => ClientTokenType, {
    name: 'token',
    deprecationReason: 'use [/api/auth/authorize]',
  })
  async clientToken(
    @CurrentUser() currentUser: CurrentUser,
    @Parent() user: UserType
  ): Promise<ClientTokenType> {
    if (user.id !== currentUser.id) {
      throw new ForbiddenException('Invalid user');
    }

    const session = await this.auth.createUserSession(
      user,
      undefined,
      this.config.auth.accessToken.ttl
    );

    return {
      sessionToken: session.sessionId,
      token: session.sessionId,
      refresh: '',
    };
  }

  @Public()
  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Mutation(() => UserType)
  async signUp(
    @Context() ctx: { req: Request; res: Response },
    @Args('name') name: string,
    @Args('email') email: string,
    @Args('password') password: string
  ) {
    validators.assertValidCredential({ email, password });
    const user = await this.auth.signUp(name, email, password);
    await this.auth.setCookie(ctx.req, ctx.res, user);
    ctx.req.user = user;
    return user;
  }

  @Public()
  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Mutation(() => UserType)
  async signIn(
    @Context() ctx: { req: Request; res: Response },
    @Args('email') email: string,
    @Args('password') password: string
  ) {
    validators.assertValidCredential({ email, password });
    const user = await this.auth.signIn(email, password);
    await this.auth.setCookie(ctx.req, ctx.res, user);
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
  async changePassword(
    @CurrentUser() user: CurrentUser,
    @Args('token') token: string,
    @Args('newPassword') newPassword: string
  ) {
    validators.assertValidPassword(newPassword);
    // NOTE: Set & Change password are using the same token type.
    const valid = await this.token.verifyToken(
      TokenType.ChangePassword,
      token,
      {
        credential: user.id,
      }
    );

    if (!valid) {
      throw new ForbiddenException('Invalid token');
    }

    await this.auth.changePassword(user.email, newPassword);

    return user;
  }

  @Throttle({
    default: {
      limit: 5,
      ttl: 60,
    },
  })
  @Mutation(() => UserType)
  async changeEmail(
    @CurrentUser() user: CurrentUser,
    @Args('token') token: string,
    @Args('email') email: string
  ) {
    validators.assertValidEmail(email);
    // @see [sendChangeEmail]
    const valid = await this.token.verifyToken(TokenType.VerifyEmail, token, {
      credential: user.id,
    });

    if (!valid) {
      throw new ForbiddenException('Invalid token');
    }

    email = decodeURIComponent(email);

    await this.auth.changeEmail(user.id, email);
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
  async sendChangePasswordEmail(
    @CurrentUser() user: CurrentUser,
    @Args('callbackUrl') callbackUrl: string,
    // @deprecated
    @Args('email', { nullable: true }) _email?: string
  ) {
    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email first.');
    }

    const token = await this.token.createToken(
      TokenType.ChangePassword,
      user.id
    );

    const url = new URL(callbackUrl, this.config.baseUrl);
    url.searchParams.set('token', token);

    const res = await this.auth.sendChangePasswordEmail(
      user.email,
      url.toString()
    );

    return !res.rejected.length;
  }

  @Throttle({
    default: {
      limit: 5,
      ttl: 60,
    },
  })
  @Mutation(() => Boolean)
  async sendSetPasswordEmail(
    @CurrentUser() user: CurrentUser,
    @Args('callbackUrl') callbackUrl: string,
    @Args('email', { nullable: true }) _email?: string
  ) {
    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email first.');
    }

    const token = await this.token.createToken(
      TokenType.ChangePassword,
      user.id
    );

    const url = new URL(callbackUrl, this.config.baseUrl);
    url.searchParams.set('token', token);

    const res = await this.auth.sendSetPasswordEmail(
      user.email,
      url.toString()
    );
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
  async sendChangeEmail(
    @CurrentUser() user: CurrentUser,
    @Args('callbackUrl') callbackUrl: string,
    // @deprecated
    @Args('email', { nullable: true }) _email?: string
  ) {
    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email first.');
    }

    const token = await this.token.createToken(TokenType.ChangeEmail, user.id);

    const url = new URL(callbackUrl, this.config.baseUrl);
    url.searchParams.set('token', token);

    const res = await this.auth.sendChangeEmail(user.email, url.toString());
    return !res.rejected.length;
  }

  @Throttle({
    default: {
      limit: 5,
      ttl: 60,
    },
  })
  @Mutation(() => Boolean)
  async sendVerifyChangeEmail(
    @CurrentUser() user: CurrentUser,
    @Args('token') token: string,
    @Args('email') email: string,
    @Args('callbackUrl') callbackUrl: string
  ) {
    validators.assertValidEmail(email);
    const valid = await this.token.verifyToken(TokenType.ChangeEmail, token, {
      credential: user.id,
    });

    if (!valid) {
      throw new ForbiddenException('Invalid token');
    }

    const hasRegistered = await this.auth.getUserByEmail(email);

    if (hasRegistered) {
      if (hasRegistered.id !== user.id) {
        throw new BadRequestException(`The email provided has been taken.`);
      } else {
        throw new BadRequestException(
          `The email provided is the same as the current email.`
        );
      }
    }

    const verifyEmailToken = await this.token.createToken(
      TokenType.VerifyEmail,
      user.id
    );

    const url = new URL(callbackUrl, this.config.baseUrl);
    url.searchParams.set('token', verifyEmailToken);
    url.searchParams.set('email', email);

    const res = await this.auth.sendVerifyChangeEmail(email, url.toString());

    return !res.rejected.length;
  }

  @Throttle({
    default: {
      limit: 5,
      ttl: 60,
    },
  })
  @Mutation(() => Boolean)
  async sendVerifyEmail(
    @CurrentUser() user: CurrentUser,
    @Args('callbackUrl') callbackUrl: string
  ) {
    const token = await this.token.createToken(TokenType.VerifyEmail, user.id);

    const url = new URL(callbackUrl, this.config.baseUrl);
    url.searchParams.set('token', token);

    const res = await this.auth.sendVerifyEmail(user.email, url.toString());
    return !res.rejected.length;
  }

  @Throttle({
    default: {
      limit: 5,
      ttl: 60,
    },
  })
  @Mutation(() => Boolean)
  async verifyEmail(
    @CurrentUser() user: CurrentUser,
    @Args('token') token: string
  ) {
    if (!token) {
      throw new BadRequestException('Invalid token');
    }

    const valid = await this.token.verifyToken(TokenType.VerifyEmail, token, {
      credential: user.id,
    });

    if (!valid) {
      throw new ForbiddenException('Invalid token');
    }

    const { emailVerifiedAt } = await this.auth.setEmailVerified(user.id);

    return emailVerifiedAt !== null;
  }
}
