import './config';

import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../../core';
import { AuthModule } from '../../core/auth';
import { BackendRuntimeModule } from '../../core/backend-runtime';
import { UserModule } from '../../core/user';
import { OAuthController } from './controller';
import { OAuthResolver } from './resolver';
import { OAuthService } from './service';

@Module({
  imports: [AuthModule, UserModule, ServerConfigModule, BackendRuntimeModule],
  providers: [OAuthService, OAuthResolver],
  controllers: [OAuthController],
})
export class OAuthModule {}
