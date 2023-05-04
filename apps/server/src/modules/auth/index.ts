import { Global, Module } from '@nestjs/common';

import { AuthResolver } from './resolver';
import { AuthService } from './service';

@Global()
@Module({
  providers: [AuthService, AuthResolver],
  exports: [AuthService],
})
export class AuthModule {}
export * from './guard';
