import { Module } from '@nestjs/common';

import { FeatureModule } from '../features';
import { QuotaModule } from '../quota';
import { StorageModule } from '../storage';
import { UserAvatarController } from './controller';
import { UserManagementResolver } from './management';
import { UserResolver } from './resolver';
import { UserService } from './service';

@Module({
  imports: [StorageModule, FeatureModule, QuotaModule],
  providers: [UserResolver, UserManagementResolver, UserService],
  controllers: [UserAvatarController],
  exports: [UserService],
})
export class UserModule {}

export { UserService } from './service';
export { UserType } from './types';
