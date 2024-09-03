import {
  Args,
  Field,
  Mutation,
  ObjectType,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import {
  ActionForbidden,
  EmailAlreadyUsed,
  EmailTokenNotFound,
  EmailVerificationRequired,
  InvalidEmailToken,
  LinkExpired,
  SameEmailProvided,
  SkipThrottle,
  Throttle,
  URLHelper,
} from '../../fundamentals';
import { Admin } from '../common';
import { UserService } from '../user';
import { UserType } from '../user/types';
import { validators } from '../utils/validators';
import { Public } from './guard';
import { AuthService } from './service';
import { CurrentUser } from './session';
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

@Throttle('strict')
@Resolver(() => UserType)
export class AuthResolver {
  constructor(
    private readonly url: URLHelper,
    private readonly auth: AuthService,
    private readonly user: UserService,
    private readonly token: TokenService
  ) {}

  @SkipThrottle()
  @Public()
  @Query(() => UserType, {
    name: 'currentUser',
    description: 'Get current user',
    nullable: true,
  })
  currentUser(@CurrentUser() user?: CurrentUser): UserType | undefined {
    return user;
  }

  @ResolveField(() => ClientTokenType, {
    name: 'token',
    deprecationReason: 'use [/api/auth/sign-in?native=true] instead',
  })
  async clientToken(
    @CurrentUser() currentUser: CurrentUser,
    @Parent() user: UserType
  ): Promise<ClientTokenType> {
    if (user.id !== currentUser.id) {
      throw new ActionForbidden();
    }

    const userSession = await this.auth.createUserSession(user.id);

    return {
      sessionToken: userSession.sessionId,
      token: userSession.sessionId,
      refresh: '',
    };
  }

  @Public()
  @Mutation(() => Boolean)
  async changePassword(
    @Args('token') token: string,
    @Args('newPassword') newPassword: string,
    @Args('userId', { type: () => String, nullable: true }) userId?: string
  ) {
    if (!userId) {
      throw new LinkExpired();
    }

    // NOTE: Set & Change password are using the same token type.
    const valid = await this.token.verifyToken(
      TokenType.ChangePassword,
      token,
      {
        credential: userId,
      }
    );

    if (!valid) {
      throw new InvalidEmailToken();
    }

    await this.auth.changePassword(userId, newPassword);
    await this.auth.revokeUserSessions(userId);

    return true;
  }

  @Mutation(() => UserType)
  async changeEmail(
    @CurrentUser() user: CurrentUser,
    @Args('token') token: string,
    @Args('email') email: string
  ) {
    // @see [sendChangeEmail]
    const valid = await this.token.verifyToken(TokenType.VerifyEmail, token, {
      credential: user.id,
    });

    if (!valid) {
      throw new InvalidEmailToken();
    }

    email = decodeURIComponent(email);

    await this.auth.changeEmail(user.id, email);
    await this.auth.revokeUserSessions(user.id);
    await this.auth.sendNotificationChangeEmail(email);

    return user;
  }

  @Mutation(() => Boolean)
  async sendChangePasswordEmail(
    @CurrentUser() user: CurrentUser,
    @Args('callbackUrl') callbackUrl: string,
    @Args('email', {
      nullable: true,
      deprecationReason: 'fetched from signed in user',
    })
    _email?: string
  ) {
    if (!user.emailVerified) {
      throw new EmailVerificationRequired();
    }

    const token = await this.token.createToken(
      TokenType.ChangePassword,
      user.id
    );

    const url = this.url.link(callbackUrl, { userId: user.id, token });

    const res = await this.auth.sendChangePasswordEmail(user.email, url);

    return !res.rejected.length;
  }

  @Mutation(() => Boolean)
  async sendSetPasswordEmail(
    @CurrentUser() user: CurrentUser,
    @Args('callbackUrl') callbackUrl: string,
    @Args('email', {
      nullable: true,
      deprecationReason: 'fetched from signed in user',
    })
    _email?: string
  ) {
    return this.sendChangePasswordEmail(user, callbackUrl);
  }

  // The change email step is:
  // 1. send email to primitive email `sendChangeEmail`
  // 2. user open change email page from email
  // 3. send verify email to new email `sendVerifyChangeEmail`
  // 4. user open confirm email page from new email
  // 5. user click confirm button
  // 6. send notification email
  @Mutation(() => Boolean)
  async sendChangeEmail(
    @CurrentUser() user: CurrentUser,
    @Args('callbackUrl') callbackUrl: string,
    // @deprecated
    @Args('email', { nullable: true }) _email?: string
  ) {
    if (!user.emailVerified) {
      throw new EmailVerificationRequired();
    }

    const token = await this.token.createToken(TokenType.ChangeEmail, user.id);

    const url = this.url.link(callbackUrl, { token });

    const res = await this.auth.sendChangeEmail(user.email, url);
    return !res.rejected.length;
  }

  @Mutation(() => Boolean)
  async sendVerifyChangeEmail(
    @CurrentUser() user: CurrentUser,
    @Args('token') token: string,
    @Args('email') email: string,
    @Args('callbackUrl') callbackUrl: string
  ) {
    if (!token) {
      throw new EmailTokenNotFound();
    }

    validators.assertValidEmail(email);
    const valid = await this.token.verifyToken(TokenType.ChangeEmail, token, {
      credential: user.id,
    });

    if (!valid) {
      throw new InvalidEmailToken();
    }

    const hasRegistered = await this.user.findUserByEmail(email);

    if (hasRegistered) {
      if (hasRegistered.id !== user.id) {
        throw new EmailAlreadyUsed();
      } else {
        throw new SameEmailProvided();
      }
    }

    const verifyEmailToken = await this.token.createToken(
      TokenType.VerifyEmail,
      user.id
    );

    const url = this.url.link(callbackUrl, { token: verifyEmailToken, email });
    const res = await this.auth.sendVerifyChangeEmail(email, url);

    return !res.rejected.length;
  }

  @Mutation(() => Boolean)
  async sendVerifyEmail(
    @CurrentUser() user: CurrentUser,
    @Args('callbackUrl') callbackUrl: string
  ) {
    const token = await this.token.createToken(TokenType.VerifyEmail, user.id);

    const url = this.url.link(callbackUrl, { token });

    const res = await this.auth.sendVerifyEmail(user.email, url);
    return !res.rejected.length;
  }

  @Mutation(() => Boolean)
  async verifyEmail(
    @CurrentUser() user: CurrentUser,
    @Args('token') token: string
  ) {
    if (!token) {
      throw new EmailTokenNotFound();
    }

    const valid = await this.token.verifyToken(TokenType.VerifyEmail, token, {
      credential: user.id,
    });

    if (!valid) {
      throw new InvalidEmailToken();
    }

    const { emailVerifiedAt } = await this.auth.setEmailVerified(user.id);

    return emailVerifiedAt !== null;
  }

  @Admin()
  @Mutation(() => String, {
    description: 'Create change password url',
  })
  async createChangePasswordUrl(
    @Args('userId') userId: string,
    @Args('callbackUrl') callbackUrl: string
  ): Promise<string> {
    const token = await this.token.createToken(
      TokenType.ChangePassword,
      userId
    );

    return this.url.link(callbackUrl, { userId, token });
  }
}
