import { Global, Module } from '@nestjs/common';

import { NextAuthController } from './next-auth.controller';
import { NextAuthOptionsProvider } from './next-auth-options';
import { AuthResolver } from './resolver';
import { AuthService } from './service';

@Global()
@Module({
  providers: [AuthService, AuthResolver, NextAuthOptionsProvider],
  exports: [AuthService, NextAuthOptionsProvider],
  controllers: [NextAuthController],
})
export class AuthModule {}

export * from './guard';
export { TokenType } from './resolver';
export { AuthService };
