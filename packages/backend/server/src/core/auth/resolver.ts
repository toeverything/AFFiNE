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

import {
  ActionForbidden,
  EmailTokenNotFound,
  LinkExpired,
  SkipThrottle,
  Throttle,
  URLHelper,
} from '../../base';
import type { GraphqlContext } from '../../base/graphql';
import { Admin } from '../common';
import { UserType } from '../user/types';
import { validators } from '../utils/validators';
import { Public } from './guard';
import { AuthService } from './service';
import { CurrentUser } from './session';

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
    private readonly auth: AuthService
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
    deprecationReason: 'use auth session exchange instead',
  })
  async clientToken(
    @CurrentUser() currentUser: CurrentUser,
    @Parent() user: UserType
  ): Promise<ClientTokenType> {
    if (user.id !== currentUser.id) {
      throw new ActionForbidden();
    }

    const issued = await this.auth.issueUser(user.id, { type: 'cookie' });
    if (!issued.sessionId) throw new Error('Cookie session was not issued.');

    return {
      sessionToken: issued.sessionId,
      token: issued.sessionId,
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

    return await this.auth.completePasswordChallenge(
      userId,
      token,
      newPassword
    );
  }

  @Mutation(() => UserType)
  async changeEmail(
    @CurrentUser() user: CurrentUser,
    @Args('token') token: string,
    @Args('email') email: string
  ) {
    email = decodeURIComponent(email);
    validators.assertValidEmail(email);
    await this.auth.completeEmailChallenge(user.id, token, email);
    return user;
  }

  @Mutation(() => Boolean)
  async sendChangePasswordEmail(
    @CurrentUser() user: CurrentUser,
    @Args('callbackUrl') callbackUrl: string,
    @Args('email', {
      type: () => String,
      nullable: true,
      deprecationReason: 'fetched from signed in user',
    })
    _email: string | undefined,
    @Context() context: GraphqlContext
  ) {
    return await this.auth.prepareSecurityChallenge(
      'change_password',
      user.id,
      this.url.safeLink(callbackUrl),
      this.auth.requestSource(context.req)
    );
  }

  @Mutation(() => Boolean)
  async sendSetPasswordEmail(
    @CurrentUser() user: CurrentUser,
    @Args('callbackUrl') callbackUrl: string,
    @Args('email', {
      type: () => String,
      nullable: true,
      deprecationReason: 'fetched from signed in user',
    })
    _email: string | undefined,
    @Context() context: GraphqlContext
  ) {
    return await this.auth.prepareSecurityChallenge(
      'set_password',
      user.id,
      this.url.safeLink(callbackUrl),
      this.auth.requestSource(context.req)
    );
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
    @Context() context: GraphqlContext
  ) {
    return await this.auth.prepareSecurityChallenge(
      'change_email',
      user.id,
      this.url.safeLink(callbackUrl),
      this.auth.requestSource(context.req)
    );
  }

  @Mutation(() => Boolean)
  async sendVerifyChangeEmail(
    @CurrentUser() user: CurrentUser,
    @Args('token') token: string,
    @Args('email') email: string,
    @Args('callbackUrl') callbackUrl: string,
    @Context() context: GraphqlContext
  ) {
    if (!token) {
      throw new EmailTokenNotFound();
    }

    validators.assertValidEmail(email);
    return await this.auth.prepareVerifyChangeEmail(
      user.id,
      token,
      email,
      this.url.safeLink(callbackUrl),
      this.auth.requestSource(context.req)
    );
  }

  @Mutation(() => Boolean)
  async sendVerifyEmail(
    @CurrentUser() user: CurrentUser,
    @Args('callbackUrl') callbackUrl: string,
    @Context() context: GraphqlContext
  ) {
    return await this.auth.prepareSecurityChallenge(
      'verify_email',
      user.id,
      this.url.safeLink(callbackUrl),
      this.auth.requestSource(context.req)
    );
  }

  @Mutation(() => Boolean)
  async verifyEmail(
    @CurrentUser() user: CurrentUser,
    @Args('token') token: string
  ) {
    if (!token) {
      throw new EmailTokenNotFound();
    }

    return await this.auth.completeVerifyEmailChallenge(user.id, token);
  }

  @Admin()
  @Mutation(() => String, {
    description: 'Create change password url',
  })
  async createChangePasswordUrl(
    @Args('userId') userId: string,
    @Args('callbackUrl') callbackUrl: string
  ): Promise<string> {
    return await this.auth.createSecurityUrl(
      'change_password',
      userId,
      this.url.safeLink(callbackUrl)
    );
  }
}
