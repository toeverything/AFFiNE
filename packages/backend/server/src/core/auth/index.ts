import { Module } from '@nestjs/common';

import { FeatureModule } from '../features';
import { UserModule } from '../user';
import { AuthController } from './controller';
import { AuthResolver } from './resolver';
import { AuthService } from './service';
import { TokenService } from './token';

@Module({
  imports: [FeatureModule, UserModule],
  providers: [AuthService, AuthResolver, TokenService],
  exports: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}

export * from './guard';
export { ClientTokenType } from './resolver';
export { AuthService };
export * from './current-user';
