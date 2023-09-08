import { Global, Module } from '@nestjs/common';

import { SessionService } from '../../session';
import { MAILER, MailService } from './mailer';
import { NextAuthController } from './next-auth.controller';
import { NextAuthOptionsProvider } from './next-auth-options';
import { AuthResolver } from './resolver';
import { AuthService } from './service';

@Global()
@Module({
  providers: [
    AuthService,
    SessionService,
    AuthResolver,
    NextAuthOptionsProvider,
    MAILER,
    MailService,
  ],
  exports: [AuthService, NextAuthOptionsProvider, MailService],
  controllers: [NextAuthController],
})
export class AuthModule {}

export * from './guard';
export { TokenType } from './resolver';
