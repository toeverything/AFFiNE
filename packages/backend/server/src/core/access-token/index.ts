import { Module } from '@nestjs/common';

import { AccessTokenResolver, UserAccessTokenResolver } from './resolver';
export { assertAccessTokenCanUseDocAction } from './scopes';

@Module({
  providers: [AccessTokenResolver, UserAccessTokenResolver],
})
export class AccessTokenModule {}
