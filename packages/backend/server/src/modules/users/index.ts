import { Module } from '@nestjs/common';

import { FeatureModule } from '../features';
import { QuotaModule } from '../quota';
import { StorageModule } from '../storage';
import { UserResolver } from './resolver';
import { UsersService } from './users';

@Module({
  imports: [StorageModule, FeatureModule, QuotaModule],
  providers: [UserResolver, UsersService],
  exports: [UsersService],
})
export class UsersModule {}

export { UserType } from './types';
export { UsersService } from './users';
