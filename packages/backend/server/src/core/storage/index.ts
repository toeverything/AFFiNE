import './config';

import { Module } from '@nestjs/common';

import { StorageRuntimeModule } from '../storage-runtime';
import { StorageBlobJob } from './blob-job';
import { BlobUploadCleanupJob } from './job';
import { R2UploadController } from './r2-proxy';
import {
  AvatarStorage,
  CommentAttachmentStorage,
  WorkspaceBlobStorage,
} from './wrappers';

@Module({
  imports: [StorageRuntimeModule],
  providers: [WorkspaceBlobStorage, AvatarStorage, CommentAttachmentStorage],
  exports: [WorkspaceBlobStorage, AvatarStorage, CommentAttachmentStorage],
})
export class StorageModule {}

@Module({
  imports: [StorageModule],
  controllers: [R2UploadController],
})
export class StorageApiModule {}

@Module({
  imports: [StorageModule],
  providers: [StorageBlobJob, BlobUploadCleanupJob],
  exports: [StorageBlobJob],
})
export class StorageWorkerModule {}

export { StorageBlobJob } from './blob-job';
export { AvatarStorage, CommentAttachmentStorage, WorkspaceBlobStorage };
