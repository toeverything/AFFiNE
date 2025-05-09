import type {
  CanActivate,
  ExecutionContext,
  OnModuleInit,
} from '@nestjs/common';
import { Injectable } from '@nestjs/common';

import {
  Config,
  getRequestResponseFromContext,
  GuardProvider,
} from '../../base';
import { CaptchaService } from './service';

@Injectable()
export class CaptchaGuardProvider
  extends GuardProvider
  implements CanActivate, OnModuleInit
{
  name = 'captcha' as const;

  constructor(
    private readonly config: Config,
    private readonly captcha: CaptchaService
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    if (!this.config.captcha.enabled) {
      return true;
    }

    const { req } = getRequestResponseFromContext(context);

    // require headers, old client send through query string
    // x-captcha-token
    // x-captcha-challenge
    const token = req.headers['x-captcha-token'] ?? req.query['token'];
    const challenge =
      req.headers['x-captcha-challenge'] ?? req.query['challenge'];

    const credential = this.captcha.assertValidCredential({ token, challenge });
    await this.captcha.verifyRequest(credential, req);

    return true;
  }
}
