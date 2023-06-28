import { Module } from '@nestjs/common';

import { StorageModule } from '../storage';
import { UserResolver } from './resolver';

@Module({
  imports: [StorageModule],
  providers: [UserResolver],
})
export class UsersModule {}

export { UserType } from './resolver';
