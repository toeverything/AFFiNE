import { Injectable, Logger } from '@nestjs/common';

import {
  ActionForbidden,
  Config,
  CryptoHelper,
  InvalidAuthState,
  InvalidEmail,
  InvalidEmailToken,
  SignUpForbidden,
  URLHelper,
  WrongSignInCredentials,
} from '../../base';
import { Models, TokenType } from '../../models';
import { validators } from '../utils/validators';
import { verifyEmailDomainRecords } from './email-domain';
import type { VerifiedIdentity } from './identity';
import { AuthService } from './service';

@Injectable()
export class MagicLinkAuthService {
  private readonly logger = new Logger(MagicLinkAuthService.name);

  constructor(
    private readonly url: URLHelper,
    private readonly auth: AuthService,
    private readonly models: Models,
    private readonly config: Config,
    private readonly crypto: CryptoHelper
  ) {}

  async send(email: string, callbackUrl = '/magic-link', clientNonce?: string) {
    validators.assertValidEmail(email);

    if (!this.url.isAllowedCallbackUrl(callbackUrl)) {
      throw new ActionForbidden();
    }

    const callbackUrlObj = this.url.url(callbackUrl);
    const redirectUriInCallback =
      callbackUrlObj.searchParams.get('redirect_uri');
    if (
      redirectUriInCallback &&
      !this.url.isAllowedRedirectUri(redirectUriInCallback)
    ) {
      throw new ActionForbidden();
    }

    const user = await this.models.user.getUserByEmail(email, {
      withDisabled: true,
    });

    if (!user) {
      await this.assertSignupAllowed(email);
    } else if (user.disabled) {
      throw new WrongSignInCredentials({ email });
    }

    const ttlInSec = 30 * 60;
    const token = await this.models.verificationToken.create(
      TokenType.SignIn,
      email,
      ttlInSec
    );

    const otp = this.crypto.otp();
    await this.models.magicLinkOtp.upsert(email, otp, token, clientNonce);

    const magicLink = this.url.link(callbackUrl, { token: otp, email });
    if (env.dev) {
      this.logger.debug(`Magic link: ${magicLink}`);
    }

    await this.auth.sendSignInEmail(email, magicLink, otp, !user);

    return { email };
  }

  async verify(
    email: string,
    otp: string,
    clientNonce?: string
  ): Promise<VerifiedIdentity> {
    validators.assertValidEmail(email);

    const consumed = await this.models.magicLinkOtp.consume(
      email,
      otp,
      clientNonce
    );
    if (!consumed.ok) {
      if (consumed.reason === 'nonce_mismatch') {
        throw new InvalidAuthState();
      }
      throw new InvalidEmailToken();
    }

    const tokenRecord = await this.models.verificationToken.verify(
      TokenType.SignIn,
      consumed.token,
      {
        credential: email,
      }
    );

    if (!tokenRecord) {
      throw new InvalidEmailToken();
    }

    const user = await this.models.user.fulfill(email);

    return { userId: user.id, method: 'magic_link' };
  }

  private async assertSignupAllowed(email: string) {
    if (!this.config.auth.allowSignup) {
      throw new SignUpForbidden();
    }

    if (!this.config.auth.requireEmailDomainVerification) {
      return;
    }

    if (!(await verifyEmailDomainRecords(email))) {
      throw new InvalidEmail({ email });
    }
  }
}
