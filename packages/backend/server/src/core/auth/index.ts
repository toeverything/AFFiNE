import './config';

import { Module } from '@nestjs/common';

import { FeatureModule } from '../features';
import { QuotaModule } from '../quota';
import { UserModule } from '../user';
import { AuthController } from './controller';
import { AuthGuard, AuthWebsocketOptionsProvider } from './guard';
import { AuthResolver } from './resolver';
import { AuthService } from './service';
import { TokenService, TokenType } from './token';

@Module({
  imports: [FeatureModule, UserModule, QuotaModule],
  providers: [
    AuthService,
    AuthResolver,
    TokenService,
    AuthGuard,
    AuthWebsocketOptionsProvider,
  ],
  exports: [AuthService, AuthGuard, AuthWebsocketOptionsProvider, TokenService],
  controllers: [AuthController],
})
export class AuthModule {}

export * from './guard';
export { ClientTokenType } from './resolver';
export { AuthService, TokenService, TokenType };
export * from './session';
