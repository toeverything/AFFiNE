import { randomUUID } from 'node:crypto';

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
import { AuthChallengeStore } from '../../core/auth';
import { verifyChallengeResponse } from '../../native';
import { CaptchaConfig } from './types';

const validator = z
  .object({
    token: z.string().min(1).max(2048),
    challenge: z.string().min(1).max(128).optional(),
    provider: z.enum(['hashcash', 'turnstile']),
  })
  .strict();
type Credential = z.infer<typeof validator>;
const turnstileResponse = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
  'error-codes': z.array(z.string()).optional(),
});

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  constructor(
    private readonly config: Config,
    private readonly challenges: AuthChallengeStore,
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

  private async verifyCaptchaToken(token: string, ip: string) {
    const formData = new FormData();
    formData.append('secret', this.captcha.turnstile.secret);
    formData.append('response', token);
    formData.append('remoteip', ip);
    formData.append('idempotency_key', randomUUID());

    const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    let result: Response;
    try {
      result = await fetch(url, {
        body: formData,
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      metrics.auth.counter('captcha_verification').add(1, {
        provider: 'turnstile',
        result: 'unavailable',
      });
      throw new NetworkError('Captcha verification temporarily unavailable');
    }
    if (!result.ok) {
      metrics.auth.counter('captcha_verification').add(1, {
        provider: 'turnstile',
        result: 'unavailable',
      });
      throw new NetworkError('Captcha verification temporarily unavailable');
    }
    let parsed: z.SafeParseReturnType<
      unknown,
      z.infer<typeof turnstileResponse>
    >;
    try {
      parsed = turnstileResponse.safeParse(await result.json());
    } catch {
      parsed = turnstileResponse.safeParse(null);
    }
    if (!parsed.success) {
      metrics.auth.counter('captcha_verification').add(1, {
        provider: 'turnstile',
        result: 'unavailable',
      });
      throw new NetworkError('Captcha verification temporarily unavailable');
    }
    const outcome = parsed.data;

    if (!outcome.success) return false;
    if (outcome.action !== this.captcha.turnstile.action) return false;

    // skip hostname check in dev mode
    if (env.dev) return true;

    // check if the hostname is in the hosts
    if (
      outcome.hostname &&
      this.config.server.hosts.includes(outcome.hostname)
    ) {
      return true;
    }

    // check if the hostname is in the host
    if (outcome.hostname && this.config.server.host === outcome.hostname) {
      return true;
    }

    this.logger.warn(
      `Captcha verification failed for hostname: ${outcome.hostname}`
    );
    return false;
  }

  private async verifyChallengeResponse(response: string, resource: string) {
    return verifyChallengeResponse(
      response,
      this.captcha.challenge.bits,
      resource
    );
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
    const resource = randomUUID();
    const challenge = await this.challenges.create(
      'captcha',
      resource,
      5 * 60 * 1000
    );

    return {
      provider,
      challenge,
      resource,
    };
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
    if (credential.provider === 'hashcash') {
      if (!credential.challenge) {
        metrics.auth.counter('captcha_verification').add(1, {
          provider: 'hashcash',
          result: 'missing_challenge',
        });
        throw new CaptchaVerificationFailed('Missing Challenge');
      }
      const resource = await this.challenges.consume<string>(
        'captcha',
        credential.challenge
      );
      if (!resource) {
        metrics.auth.counter('captcha_verification').add(1, {
          provider: 'hashcash',
          result: 'expired_or_replayed',
        });
        throw new CaptchaVerificationFailed('Invalid Challenge Response');
      }
      const isChallengeVerified = await this.verifyChallengeResponse(
        credential.token,
        resource
      );
      if (!isChallengeVerified) {
        metrics.auth.counter('captcha_verification').add(1, {
          provider: 'hashcash',
          result: 'invalid_proof',
        });
        throw new CaptchaVerificationFailed('Invalid Challenge Response');
      }
      metrics.auth.counter('captcha_verification').add(1, {
        provider: 'hashcash',
        result: 'success',
      });
    } else {
      if (credential.challenge) {
        throw new CaptchaVerificationFailed('Unexpected Challenge');
      }
      const isTokenVerified = await this.verifyCaptchaToken(
        credential.token,
        getRequestClientIp(req)
      );

      if (!isTokenVerified) {
        metrics.auth.counter('captcha_verification').add(1, {
          provider: 'turnstile',
          result: 'failed',
        });
        throw new CaptchaVerificationFailed('Invalid Captcha Response');
      }
      metrics.auth.counter('captcha_verification').add(1, {
        provider: 'turnstile',
        result: 'success',
      });
    }
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
