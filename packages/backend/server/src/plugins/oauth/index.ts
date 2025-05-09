import './config';

import { Module } from '@nestjs/common';

import { ServerConfigModule } from '../../core';
import { AuthModule } from '../../core/auth';
import { UserModule } from '../../core/user';
import { OAuthController } from './controller';
import { OAuthProviderFactory } from './factory';
import { OAuthProviders } from './providers';
import { OAuthResolver } from './resolver';
import { OAuthService } from './service';

@Module({
  imports: [AuthModule, UserModule, ServerConfigModule],
  providers: [
    OAuthProviderFactory,
    OAuthService,
    OAuthResolver,
    ...OAuthProviders,
  ],
  controllers: [OAuthController],
})
export class OAuthModule {}
