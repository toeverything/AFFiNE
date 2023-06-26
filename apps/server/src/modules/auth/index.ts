import { Global, Module } from '@nestjs/common';

import { NextAuthController } from './next-auth.controller';
import { AuthResolver } from './resolver';
import { AuthService } from './service';

@Global()
@Module({
  providers: [AuthService, AuthResolver],
  exports: [AuthService],
  controllers: [NextAuthController],
})
export class AuthModule {}
export * from './guard';
