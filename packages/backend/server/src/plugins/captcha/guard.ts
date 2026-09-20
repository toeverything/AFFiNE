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

    const token = req.headers['x-captcha-token'];
    const challenge = req.headers['x-captcha-challenge'];
    const provider = req.headers['x-captcha-provider'];

    const credential = this.captcha.assertValidCredential({
      token,
      challenge,
      provider,
    });
    await this.captcha.verifyRequest(credential, req);

    return true;
  }
}
