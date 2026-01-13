import { Module } from '@nestjs/common';

import { AccessTokenResolver, UserAccessTokenResolver } from './resolver';

@Module({
  providers: [AccessTokenResolver, UserAccessTokenResolver],
})
export class AccessTokenModule {}
