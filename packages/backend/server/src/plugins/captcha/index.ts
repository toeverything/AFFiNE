import './config';

import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../../core';
import { AuthModule } from '../../core/auth';
import { CaptchaController } from './controller';
import { CaptchaGuardProvider } from './guard';
import { CaptchaService } from './service';

@Module({
  imports: [AuthModule, ServerConfigModule],
  providers: [CaptchaService, CaptchaGuardProvider],
  controllers: [CaptchaController],
})
export class CaptchaModule {}

export type { CaptchaConfig } from './types';
