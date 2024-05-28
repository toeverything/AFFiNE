import './config';

import { Module } from '@nestjs/common';

import { AvatarStorage, WorkspaceBlobStorage } from './wrappers';

@Module({
  providers: [WorkspaceBlobStorage, AvatarStorage],
  exports: [WorkspaceBlobStorage, AvatarStorage],
})
export class StorageModule {}

export { AvatarStorage, WorkspaceBlobStorage };
