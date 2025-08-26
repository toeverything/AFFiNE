import './config';

import { Module } from '@nestjs/common';

import {
  AvatarStorage,
  CommentAttachmentStorage,
  WorkspaceBlobStorage,
} from './wrappers';

@Module({
  providers: [WorkspaceBlobStorage, AvatarStorage, CommentAttachmentStorage],
  exports: [WorkspaceBlobStorage, AvatarStorage, CommentAttachmentStorage],
})
export class StorageModule {}

export { AvatarStorage, CommentAttachmentStorage, WorkspaceBlobStorage };
