import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';

import {
  CaptchaVerificationFailed,
  Config,
  getRequestClientIp,
  metrics,
  NetworkError,
  OnEvent,
} from '../../base';
import { ServerFeature, ServerService } from '../../core';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { CaptchaConfig } from './types';

const validator = z
  .object({
    token: z.string().min(1).max(2048),
    challenge: z.string().min(1).max(128).optional(),
    provider: z.enum(['hashcash', 'turnstile']),
  })
  .strict();
type Credential = z.infer<typeof validator>;

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(
    private readonly config: Config,
    private readonly runtime: BackendRuntimeProvider,
    private readonly server: ServerService
  ) {}

  private get captcha(): CaptchaConfig {
    return this.config.captcha.config;
  }

  @OnEvent('config.init')
  onConfigInit() {
    this.setup();
  }

  @OnEvent('config.changed')
  onConfigChanged(event: Events['config.changed']) {
    if ('captcha' in event.updates) {
      this.setup();
    }
  }

  async getClientConfig(nativeClient: boolean) {
    const provider = nativeClient
      ? ('hashcash' as const)
      : ('turnstile' as const);
    if (provider === 'turnstile') {
      return {
        provider,
        siteKey: this.captcha.turnstile.siteKey,
        action: this.captcha.turnstile.action,
      };
    }
    return { provider, ...(await this.runtime.createAuthCaptchaChallengeV1()) };
  }

  assertValidCredential(credential: any): Credential {
    try {
      return validator.parse(credential);
    } catch {
      metrics.auth.counter('captcha_verification').add(1, {
        provider:
          credential?.provider === 'hashcash' ||
          credential?.provider === 'turnstile'
            ? credential.provider
            : 'unknown',
        result: 'invalid_credential',
      });
      throw new CaptchaVerificationFailed('Invalid Credential');
    }
  }

  async verifyRequest(credential: Credential, req: Request) {
    let verified: boolean;
    try {
      verified = await this.runtime.verifyAuthCaptchaV1({
        provider: credential.provider,
        token: credential.token,
        challenge: credential.challenge,
        bits: this.captcha.challenge.bits,
        secret: this.captcha.turnstile.secret,
        action: this.captcha.turnstile.action,
        ip: getRequestClientIp(req),
        hosts: [...this.config.server.hosts, this.config.server.host],
        dev: env.dev,
      });
    } catch (error) {
      if (String(error).includes('captcha_provider_unavailable')) {
        metrics.auth.counter('captcha_verification').add(1, {
          provider: credential.provider,
          result: 'unavailable',
        });
        throw new NetworkError('Captcha verification temporarily unavailable');
      }
      metrics.auth.counter('captcha_verification').add(1, {
        provider: credential.provider,
        result: 'runtime_error',
      });
      this.logger.error('Captcha verification runtime failed', error);
      verified = false;
    }
    if (!verified) {
      metrics.auth.counter('captcha_verification').add(1, {
        provider: credential.provider,
        result: 'failed',
      });
      throw new CaptchaVerificationFailed('Invalid Captcha Response');
    }
    metrics.auth.counter('captcha_verification').add(1, {
      provider: credential.provider,
      result: 'success',
    });
  }

  private setup() {
    if (this.config.captcha.enabled) {
      if (!this.captcha.turnstile.secret || !this.captcha.turnstile.siteKey) {
        throw new Error(
          'Enabled captcha requires Turnstile secret and site key.'
        );
      }
      this.server.enableFeature(ServerFeature.Captcha);
    } else {
      this.server.disableFeature(ServerFeature.Captcha);
    }
  }
}
