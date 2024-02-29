import assert from 'node:assert';
import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { nanoid } from 'nanoid';

import { TokenService, TokenType } from '../../core/auth/token';
import { Config, verifyChallengeResponse } from '../../fundamentals';
import { CaptchaConfig } from './types';

@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);
  private readonly captcha: CaptchaConfig;

  constructor(
    private readonly config: Config,
    private readonly token: TokenService
  ) {
    assert(config.plugins.captcha);
    this.captcha = config.plugins.captcha;
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
    const outcome = await result.json();

    return (
      !!outcome.success &&
      // skip hostname check in dev mode
      (this.config.node.dev || outcome.hostname === this.config.host)
    );
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
    const challenge = this.token.createToken(
      TokenType.Challenge,
      resource,
      5 * 60
    );

    return {
      challenge,
      resource,
    };
  }

  private rejectResponse(res: Response, error: string, status = 400) {
    res.status(status);
    res.json({
      url: `${this.config.baseUrl}/api/auth/error?${new URLSearchParams({
        error,
      }).toString()}`,
      error,
    });
  }

  async verifyRequest(req: Request, res: Response): Promise<boolean> {
    const challenge = req.query?.challenge;
    if (typeof challenge === 'string' && challenge) {
      const resource = await this.token
        .verifyToken(TokenType.Challenge, challenge)
        .then(token => token?.credential);

      if (!resource) {
        this.rejectResponse(res, 'Invalid Challenge');
        return false;
      }

      const isChallengeVerified = await this.verifyChallengeResponse(
        req.query?.token,
        resource
      );

      this.logger.debug(
        `Challenge: ${challenge}, Resource: ${resource}, Response: ${req.query?.token}, isChallengeVerified: ${isChallengeVerified}`
      );

      if (!isChallengeVerified) {
        this.rejectResponse(res, 'Invalid Challenge Response');
        return false;
      }
    } else {
      const isTokenVerified = await this.verifyCaptchaToken(
        req.query?.token,
        req.headers['CF-Connecting-IP'] as string
      );

      if (!isTokenVerified) {
        this.rejectResponse(res, 'Invalid Captcha Response');
        return false;
      }
    }
    return true;
  }
}
