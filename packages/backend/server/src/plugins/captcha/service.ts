import assert from 'node:assert';

import { Injectable } from '@nestjs/common';
import { nanoid } from 'nanoid';

import { Config, verifyChallengeResponse } from '../../fundamentals';
import { CaptchaConfig } from '.';

@Injectable()
export class CaptchaService {
  private readonly captcha: CaptchaConfig;

  constructor(private readonly config: Config) {
    assert(config.plugins.captcha);
    this.captcha = config.plugins.captcha;
  }

  async verifyCaptchaToken(token: any, ip: string) {
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
    const outcome = await result.json();

    return (
      !!outcome.success &&
      // skip hostname check in dev mode
      (this.config.node.dev || outcome.hostname === this.config.host)
    );
  }

  async verifyChallengeResponse(response: any, resource: string) {
    return verifyChallengeResponse(
      response,
      this.captcha.challenge.bits,
      resource
    );
  }
}
