import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { CaptchaVerificationFailed, Config, OnEvent } from '../../base';
import { ServerFeature, ServerService } from '../../core';
import { Models, TokenType } from '../../models';
import { verifyChallengeResponse } from '../../native';
import { CaptchaConfig } from './types';

const validator = z
  .object({ token: z.string(), challenge: z.string().optional() })
  .strict();
type Credential = z.infer<typeof validator>;

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly captcha: CaptchaConfig;

  constructor(
    private readonly config: Config,
    private readonly models: Models,
    private readonly server: ServerService
  ) {
    this.captcha = config.captcha.config;
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

  private async verifyCaptchaToken(token: any, ip: string) {
    if (typeof token !== 'string' || !token) return false;

    const formData = new FormData();
    formData.append('secret', this.captcha.turnstile.secret);
    formData.append('response', token);
    formData.append('remoteip', ip);
    // prevent replay attack
    formData.append('idempotency_key', nanoid());

    const url = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    const result = await fetch(url, {
      body: formData,
      method: 'POST',
    });
    const outcome = (await result.json()) as {
      success: boolean;
      hostname: string;
    };

    if (!outcome.success) return false;

    // skip hostname check in dev mode
    if (env.dev) return true;

    // check if the hostname is in the hosts
    if (this.config.server.hosts.includes(outcome.hostname)) return true;

    // check if the hostname is in the host
    if (this.config.server.host === outcome.hostname) return true;

    this.logger.warn(
      `Captcha verification failed for hostname: ${outcome.hostname}`
    );
    return false;
  }

  private async verifyChallengeResponse(response: any, resource: string) {
    return verifyChallengeResponse(
      response,
      this.captcha.challenge.bits,
      resource
    );
  }

  async getChallengeToken() {
    const resource = randomUUID();
    const challenge = await this.models.verificationToken.create(
      TokenType.Challenge,
      resource,
      5 * 60
    );

    return {
      challenge,
      resource,
    };
  }

  assertValidCredential(credential: any): Credential {
    try {
      return validator.parse(credential);
    } catch {
      throw new CaptchaVerificationFailed('Invalid Credential');
    }
  }

  async verifyRequest(credential: Credential, req: Request) {
    const challenge = credential.challenge;
    let resource: string | null = null;
    if (typeof challenge === 'string' && challenge) {
      resource = await this.models.verificationToken
        .get(TokenType.Challenge, challenge)
        .then(token => token?.credential || null);
    }

    if (resource) {
      const isChallengeVerified = await this.verifyChallengeResponse(
        credential.token,
        resource
      );

      this.logger.debug(
        `Challenge: ${challenge}, Resource: ${resource}, Response: ${credential.token}, isChallengeVerified: ${isChallengeVerified}`
      );

      if (!isChallengeVerified) {
        throw new CaptchaVerificationFailed('Invalid Challenge Response');
      }
    } else {
      const isTokenVerified = await this.verifyCaptchaToken(
        credential.token,
        req.headers['CF-Connecting-IP'] as string
      );

      if (!isTokenVerified) {
        throw new CaptchaVerificationFailed('Invalid Captcha Response');
      }
    }
  }

  private setup() {
    if (this.config.captcha.enabled) {
      this.server.enableFeature(ServerFeature.Captcha);
    } else {
      this.server.disableFeature(ServerFeature.Captcha);
    }
  }
}
