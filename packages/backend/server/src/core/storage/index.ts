import './config';

import { Module } from '@nestjs/common';

import { BlobUploadCleanupJob } from './job';
import {
  AvatarStorage,
  CommentAttachmentStorage,
  WorkspaceBlobStorage,
} from './wrappers';

@Module({
  providers: [
    WorkspaceBlobStorage,
    AvatarStorage,
    CommentAttachmentStorage,
    BlobUploadCleanupJob,
  ],
  exports: [WorkspaceBlobStorage, AvatarStorage, CommentAttachmentStorage],
})
export class StorageModule {}

export { AvatarStorage, CommentAttachmentStorage, WorkspaceBlobStorage };
