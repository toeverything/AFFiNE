import { Module } from '@nestjs/common';

import { UserResolver } from './resolver';

@Module({
  providers: [UserResolver],
})
export class UsersModule {}
