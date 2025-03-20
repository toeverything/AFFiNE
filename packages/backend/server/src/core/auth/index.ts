import './config';

import { Module } from '@nestjs/common';

import { FeatureModule } from '../features';
import { MailModule } from '../mail';
import { QuotaModule } from '../quota';
import { UserModule } from '../user';
import { AuthController } from './controller';
import { AuthGuard, AuthWebsocketOptionsProvider } from './guard';
import { AuthCronJob } from './job';
import { AuthResolver } from './resolver';
import { AuthService } from './service';

@Module({
  imports: [FeatureModule, UserModule, QuotaModule, MailModule],
  providers: [
    AuthService,
    AuthResolver,
    AuthGuard,
    AuthCronJob,
    AuthWebsocketOptionsProvider,
  ],
  exports: [AuthService, AuthGuard, AuthWebsocketOptionsProvider],
  controllers: [AuthController],
})
export class AuthModule {}

export * from './guard';
export { ClientTokenType } from './resolver';
export { AuthService };
export * from './session';
