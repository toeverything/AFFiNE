import { Module } from '@nestjs/common';

import { PermissionModule } from '../permission';
import { StorageModule } from '../storage';
import { UserAvatarController } from './controller';
import { UserManagementResolver, UserResolver } from './resolver';
import { UserService } from './service';

@Module({
  imports: [StorageModule, PermissionModule],
  providers: [UserResolver, UserService, UserManagementResolver],
  controllers: [UserAvatarController],
  exports: [UserService],
})
export class UserModule {}

export { UserService } from './service';
export { UserType } from './types';
