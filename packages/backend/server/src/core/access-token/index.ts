import { Module } from '@nestjs/common';

import { AccessTokenResolver } from './resolver';

@Module({
  providers: [AccessTokenResolver],
})
export class AccessTokenModule {}
