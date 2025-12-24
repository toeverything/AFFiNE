import './config';

import { Module } from '@nestjs/common';

import { BlobUploadCleanupJob } from './job';
import { R2UploadController } from './r2-proxy';
import {
  AvatarStorage,
  CommentAttachmentStorage,
  WorkspaceBlobStorage,
} from './wrappers';

@Module({
  controllers: [R2UploadController],
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
