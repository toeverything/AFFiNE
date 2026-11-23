import { Injectable, Logger } from '@nestjs/common';

import {
  InvalidAuthState,
  InvalidOauthCallbackCode,
  InvalidOauthCallbackState,
  InvalidOauthResponse,
  OauthStateExpired,
  OnEvent,
  SignUpForbidden,
  UnknownOauthProvider,
} from '../../base';
import type {
  NativeLoginResult,
  SessionIssueInput,
} from '../../core/auth/session-issuer';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { ServerFeature, ServerService } from '../../core/config';
import { OAuthProviderName } from './config';

type NativeOAuthCallback =
  | {
      type: 'handoff';
      code: string;
      provider: string;
      stateToken: string;
      client: string;
    }
  | ({
      type: 'login';
      redirectUri?: string;
      provider: string;
      client: string;
    } & NativeLoginResult);

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private activeProviders: OAuthProviderName[] = [];

  constructor(
    private readonly runtime: BackendRuntimeProvider,
    private readonly server: ServerService
  ) {}

  get providers() {
    return this.activeProviders;
  }

  @OnEvent('config.init')
  async refreshProviders() {
    try {
      this.activeProviders = await this.runtime.executeAuthSessionCommandV1<
        OAuthProviderName[]
      >({
        action: 'oauth_providers',
      });
    } catch (error) {
      this.logger.error(
        `Failed to load native OAuth providers: ${error instanceof Error ? error.name : 'unknown'}`
      );
      return;
    }
    if (this.activeProviders.length) {
      this.server.enableFeature(ServerFeature.OAuth);
    } else {
      this.server.disableFeature(ServerFeature.OAuth);
    }
  }

  @OnEvent('backendRuntime.configApplied')
  async onConfigApplied({ updates }: Events['backendRuntime.configApplied']) {
    if (updates.oauth) await this.refreshProviders();
  }

  async preflight(input: {
    provider: OAuthProviderName;
    redirectUri?: string;
    client: string;
    clientNonce: string;
    clientVersion?: string;
    callbackUrl: string;
    redirectBaseUrl: string;
    redirectAllowedOrigins: string[];
    redirectTrustedDomains: string[];
  }) {
    return await this.call<{ url: string }>({
      action: 'oauth_preflight',
      ...input,
    });
  }

  async callback(input: {
    code: string;
    state: string;
    clientNonce?: string;
    issue: SessionIssueInput;
  }) {
    return await this.call<NativeOAuthCallback>({
      action: 'oauth_callback',
      ...input,
    });
  }

  private async call<T>(input: Record<string, unknown>) {
    try {
      return await this.runtime.executeAuthSessionCommandV1<T>(input);
    } catch (error) {
      const message = String(error);
      if (message.includes('unknown_oauth_provider')) {
        throw new UnknownOauthProvider({ name: String(input.provider ?? '') });
      }
      if (message.includes('invalid_oauth_callback_state')) {
        throw new InvalidOauthCallbackState();
      }
      if (message.includes('oauth_state_expired')) {
        throw new OauthStateExpired();
      }
      if (message.includes('invalid_auth_state')) {
        throw new InvalidAuthState();
      }
      if (message.includes('sign_up_forbidden')) {
        throw new SignUpForbidden();
      }
      if (message.includes('invalid_oauth_callback_code')) {
        throw new InvalidOauthCallbackCode({ status: 400, body: '' });
      }
      if (message.includes('invalid_oauth_response')) {
        throw new InvalidOauthResponse({ reason: 'Invalid OAuth response.' });
      }
      throw error;
    }
  }
}
