import { Injectable } from '@nestjs/common';

import {
  Config,
  EmailServiceNotConfigured,
  InvalidAuthState,
  InvalidEmailToken,
  NetworkError,
  SignUpForbidden,
  TooManyRequest,
  URLHelper,
  WrongSignInCredentials,
} from '../../base';
import {
  BackendRuntimeProvider,
  type RuntimeQuotaSourceInput,
} from '../backend-runtime';
import { MailSender } from '../mail/sender';
import { validators } from '../utils/validators';
import type { NativeLoginResult, SessionIssueInput } from './session-issuer';

@Injectable()
export class MagicLinkAuthService {
  constructor(
    private readonly url: URLHelper,
    private readonly config: Config,
    private readonly runtime: BackendRuntimeProvider,
    private readonly sender: MailSender
  ) {}

  async send(
    email: string,
    callbackUrl = '/magic-link',
    clientNonce?: string,
    source?: RuntimeQuotaSourceInput
  ) {
    validators.assertValidEmail(email);
    if (!this.sender.configured) throw new EmailServiceNotConfigured();
    const callbackUrlObj = new URL(this.url.safeLink(callbackUrl));
    const redirectUri = callbackUrlObj.searchParams.get('redirect_uri');
    if (redirectUri) {
      callbackUrlObj.searchParams.set(
        'redirect_uri',
        this.url.canonicalRedirectUri(redirectUri)
      );
    }
    try {
      const canonicalEmail =
        await this.runtime.executeAuthSessionCommandV1<string>({
          action: 'prepare_magic_link',
          email,
          callbackUrl: callbackUrlObj.toString(),
          clientNonce,
          serverName:
            this.config.server.name ??
            (env.selfhosted ? 'AFFiNE Self-hosted' : 'AFFiNE Cloud'),
          source,
        });
      return { email: canonicalEmail };
    } catch (error) {
      if (String(error).includes('wrong_sign_in_credentials')) {
        throw new WrongSignInCredentials({ email });
      }
      if (String(error).includes('sign_up_forbidden')) {
        throw new SignUpForbidden();
      }
      if (String(error).includes('mail_quota_denied')) {
        throw new TooManyRequest();
      }
      if (String(error).includes('email_domain_verification_unavailable')) {
        throw new NetworkError();
      }
      throw error;
    }
  }

  async complete(
    email: string,
    otp: string,
    clientNonce: string | undefined,
    issue: SessionIssueInput
  ): Promise<NativeLoginResult> {
    validators.assertValidEmail(email);
    try {
      return await this.runtime.executeAuthSessionCommandV1<NativeLoginResult>({
        action: 'complete_magic_link',
        email,
        otp,
        clientNonce,
        issue,
      });
    } catch (error) {
      if (String(error).includes('invalid_auth_state')) {
        throw new InvalidAuthState();
      }
      if (String(error).includes('email_domain_verification_unavailable')) {
        throw new NetworkError();
      }
      throw new InvalidEmailToken();
    }
  }
}
