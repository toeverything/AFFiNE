import { Module } from '@nestjs/common';

import { StorageModule } from '../storage';
import { UserResolver } from './resolver';
import { UsersService } from './users';

@Module({
  imports: [StorageModule],
  providers: [UserResolver, UsersService],
  exports: [UsersService],
})
export class UsersModule {}

export { UserType } from './resolver';
export { UsersService } from './users';
