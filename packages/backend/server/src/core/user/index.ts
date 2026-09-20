import { Module } from '@nestjs/common';

import { PermissionModule } from '../permission';
import { StorageModule } from '../storage';
import { UserAvatarController } from './controller';
import { UserRealtimeProvider } from './realtime';
import {
  UserManagementResolver,
  UserResolver,
  UserSettingsResolver,
} from './resolver';

@Module({
  imports: [StorageModule, PermissionModule],
  providers: [
    UserResolver,
    UserManagementResolver,
    UserSettingsResolver,
    UserRealtimeProvider,
  ],
  controllers: [UserAvatarController],
})
export class UserModule {}

export { PublicUserType, UserType, WorkspaceUserType } from './types';
