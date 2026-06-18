import './config';

import { Module } from '@nestjs/common';

import { FeatureModule } from '../features';
import { MailModule } from '../mail';
import { QuotaModule } from '../quota';
import { UserModule } from '../user';
import { AuthChallengeStore } from './challenge-store';
import { AuthController } from './controller';
import { AuthGuard, AuthWebsocketOptionsProvider } from './guard';
import { AuthCronJob } from './job';
import { JwtSessionService } from './jwt-session';
import { MagicLinkAuthService } from './magic-link';
import { AuthMethodsService } from './methods';
import { SessionExchangeService } from './native-exchange';
import { OpenAppAuthService } from './open-app';
import { AuthResolver } from './resolver';
import { AuthService } from './service';
import { SessionIssuer } from './session-issuer';

@Module({
  imports: [FeatureModule, UserModule, QuotaModule, MailModule],
  providers: [
    AuthService,
    AuthResolver,
    AuthGuard,
    JwtSessionService,
    SessionIssuer,
    AuthChallengeStore,
    MagicLinkAuthService,
    OpenAppAuthService,
    AuthMethodsService,
    SessionExchangeService,
    AuthCronJob,
    AuthWebsocketOptionsProvider,
  ],
  exports: [
    AuthService,
    AuthGuard,
    JwtSessionService,
    SessionIssuer,
    AuthChallengeStore,
    MagicLinkAuthService,
    OpenAppAuthService,
    AuthMethodsService,
    SessionExchangeService,
    AuthWebsocketOptionsProvider,
  ],
  controllers: [AuthController],
})
export class AuthModule {}

export { AuthChallengeStore } from './challenge-store';
export * from './guard';
export * from './identity';
export * from './input';
export { MagicLinkAuthService } from './magic-link';
export * from './methods';
export { SessionExchangeService };
export { OpenAppAuthService } from './open-app';
export { ClientTokenType } from './resolver';
export { AuthService, JwtSessionService, SessionIssuer };
export * from './session';
