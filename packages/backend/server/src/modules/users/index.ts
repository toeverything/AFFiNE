import { Module } from '@nestjs/common';

import { FeatureModule } from '../features';
import { StorageModule } from '../storage';
import { UserResolver } from './resolver';
import { UsersService } from './users';

@Module({
  imports: [StorageModule, FeatureModule],
  providers: [UserResolver, UsersService],
  exports: [UsersService],
})
export class UsersModule {}

export { UserType } from './resolver';
export { UsersService } from './users';
