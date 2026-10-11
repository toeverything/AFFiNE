import { Logger, UseGuards } from '@nestjs/common';
import {
  Args,
  Int,
  Mutation,
  Parent,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import type { FileUpload } from '../../../base';
import {
  BlobInvalid,
  BlobNotFound,
  BlobQuotaExceeded,
  CloudThrottlerGuard,
  readBuffer,
  StorageQuotaExceeded,
} from '../../../base';
import { Models } from '../../../models';
import { CurrentUser } from '../../auth';
import { BackendRuntimeProvider } from '../../backend-runtime';
import { PermissionAccess } from '../../permission';
import { WorkspaceBlobStorage } from '../../storage';
import {
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
} from '../../storage/constants';
import { WorkspaceType } from '../types';
import {
  BlobUploadInit,
  BlobUploadMethod,
  BlobUploadPart,
  BlobUploadPartInput,
  ListedBlob,
} from './blob-types';

@UseGuards(CloudThrottlerGuard)
@Resolver(() => WorkspaceType)
export class WorkspaceBlobResolver {
  logger = new Logger(WorkspaceBlobResolver.name);
  constructor(
    private readonly ac: PermissionAccess,
    private readonly runtime: BackendRuntimeProvider,
    private readonly storage: WorkspaceBlobStorage,
    private readonly models: Models
  ) {}

  @ResolveField(() => [ListedBlob], {
    description: 'List blobs of workspace',
    complexity: 2,
  })
  async blobs(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType
  ) {
    return this.runtime.listManagedWorkspaceBlobsV1(user.id, workspace.id);
  }

  @ResolveField(() => BlobUploadPart, {
    description: 'Get blob upload part url',
  })
  async blobUploadPartUrl(
    @CurrentUser() user: CurrentUser,
    @Parent() workspace: WorkspaceType,
    @Args('key') key: string,
    @Args('uploadId') uploadId: string,
    @Args('partNumber', { type: () => Int }) partNumber: number
  ): Promise<BlobUploadPart> {
    return this.getUploadPart(user, workspace.id, key, uploadId, partNumber);
  }

  @Mutation(() => String)
  async setBlob(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args({ name: 'blob', type: () => GraphQLUpload })
    blob: FileUpload
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Blobs.Upload');

    const buffer = await readBuffer(blob.createReadStream(), () => undefined);
    const reservation = await this.reserveStorage({
      workspaceId,
      userId: user.id,
      key: blob.filename,
      size: buffer.byteLength,
      mime: blob.mimetype || 'application/octet-stream',
      kind: 'blob',
    });
    if (reservation.alreadyUploaded) return blob.filename;
    if (!reservation.reservationId)
      throw new BlobInvalid('Missing blob reservation');
    let metadata;
    try {
      metadata = await this.storage.putReservation(
        workspaceId,
        blob.filename,
        reservation.reservationId,
        buffer,
        {
          contentType: blob.mimetype || 'application/octet-stream',
          contentLength: buffer.byteLength,
        }
      );
    } catch (error) {
      this.logger.error(
        {
          message: 'Failed to write blob upload',
          workspaceId,
          key: blob.filename,
          size: buffer.byteLength,
          mime: blob.mimetype,
          reservationId: reservation.reservationId,
        },
        error
      );
      try {
        await this.runtime.abortStorageReservationV1({
          workspaceId,
          userId: user.id,
          key: blob.filename,
          reservationId: reservation.reservationId,
          kind: 'blob',
        });
      } catch (cleanupError) {
        this.logger.warn(
          {
            message: 'Failed to abort blob reservation',
            workspaceId,
            key: blob.filename,
            reservationId: reservation.reservationId,
          },
          cleanupError
        );
      }
      throw error;
    }
    const finalized = await this.finalizeReservation({
      workspaceId,
      userId: user.id,
      key: blob.filename,
      reservationId: reservation.reservationId,
      kind: 'blob',
      size: metadata.contentLength,
      mime: metadata.contentType,
    });
    if (!finalized) throw new BlobInvalid('Blob reservation changed');
    return blob.filename;
  }

  @Mutation(() => BlobUploadInit)
  async createBlobUpload(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('key') key: string,
    @Args('size', { type: () => Int }) size: number,
    @Args('mime') mime: string
  ): Promise<BlobUploadInit> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Blobs.Upload');

    const reservation = await this.reserveStorage({
      workspaceId,
      userId: user.id,
      key,
      size,
      mime: mime || 'application/octet-stream',
      kind: 'blob',
    });
    if (reservation.alreadyUploaded) {
      return {
        method: BlobUploadMethod.GRAPHQL,
        blobKey: key,
        alreadyUploaded: true,
      };
    }
    if (!reservation.reservationId)
      throw new BlobInvalid('Missing blob reservation');

    let record = await this.models.blob.get(workspaceId, key);
    mime = mime || 'application/octet-stream';
    if (record) {
      if (record.size !== size) {
        throw new BlobInvalid('Blob size mismatch');
      }

      if (record.status === 'completed') {
        const existingMetadata = await this.storage.head(workspaceId, key);
        if (!existingMetadata) {
          // record exists but object is missing, treat as a new upload
          record = null;
        } else if (existingMetadata.contentLength !== size) {
          throw new BlobInvalid('Blob size mismatch');
        } else {
          return {
            method: BlobUploadMethod.GRAPHQL,
            blobKey: key,
            alreadyUploaded: true,
          };
        }
      } else {
        mime = record.mime;
      }
    }

    const metadata = { contentType: mime, contentLength: size };
    let init: BlobUploadInit | null = null;
    let uploadIdForRecord: string | null = null;

    try {
      const capabilities = await this.storage.capabilities();

      // try to resume multipart uploads
      if (capabilities.multipartDirect && record && record.uploadId) {
        const uploadedParts = await this.storage.listMultipartUploadParts(
          workspaceId,
          key,
          record.uploadId
        );

        if (uploadedParts) {
          return {
            method: BlobUploadMethod.MULTIPART,
            blobKey: key,
            uploadId: record.uploadId,
            partSize: MULTIPART_PART_SIZE,
            uploadedParts,
          };
        }
      }

      if (capabilities.multipartDirect && size >= MULTIPART_THRESHOLD) {
        const multipart = await this.storage.createMultipartUpload(
          workspaceId,
          key,
          reservation.reservationId,
          metadata
        );
        if (multipart) {
          uploadIdForRecord = multipart.uploadId;
          init = {
            method: BlobUploadMethod.MULTIPART,
            blobKey: key,
            uploadId: multipart.uploadId,
            partSize: MULTIPART_PART_SIZE,
            expiresAt: multipart.expiresAt,
            uploadedParts: [],
          };
        }
      }

      if (!init && capabilities.presignPut) {
        const presigned = await this.storage.presignPut(
          workspaceId,
          key,
          reservation.reservationId,
          metadata
        );
        if (presigned) {
          init = {
            method: BlobUploadMethod.PRESIGNED,
            blobKey: key,
            uploadUrl: presigned.url,
            headers: presigned.headers,
            expiresAt: presigned.expiresAt,
          };
        }
      }
    } catch (error) {
      this.logger.warn(
        {
          message: 'Failed to initialize direct blob upload',
          workspaceId,
          key,
          size,
          mime,
          reservationId: reservation.reservationId,
        },
        error
      );
      init = null;
      uploadIdForRecord = null;
    }

    if (!init) {
      init = {
        method: BlobUploadMethod.GRAPHQL,
        blobKey: key,
      };
    }

    await this.models.blob.setReservationUploadId(
      workspaceId,
      key,
      reservation.reservationId,
      uploadIdForRecord
    );

    return init;
  }

  @Mutation(() => String)
  async completeBlobUpload(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('key') key: string,
    @Args('uploadId', { nullable: true }) uploadId?: string,
    @Args({
      name: 'parts',
      type: () => [BlobUploadPartInput],
      nullable: true,
    })
    parts?: BlobUploadPartInput[]
  ): Promise<string> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Blobs.Upload');

    const record = await this.models.blob.get(workspaceId, key);
    if (!record) {
      throw new BlobNotFound({ spaceId: workspaceId, blobId: key });
    }
    if (record.status === 'completed') {
      return key;
    }

    const hasMultipartInput =
      uploadId !== undefined || (parts?.length ?? 0) > 0;
    const hasMultipartRecord = !!record.uploadId;
    if (hasMultipartRecord) {
      if (!uploadId || !parts || parts.length === 0) {
        throw new BlobInvalid(
          'Multipart upload requires both uploadId and parts'
        );
      }
      if (uploadId !== record.uploadId) {
        throw new BlobInvalid('Upload id mismatch');
      }

      const metadata = await this.storage.head(workspaceId, key);
      if (!metadata) {
        const completed = await this.storage.completeMultipartUpload(
          workspaceId,
          key,
          uploadId,
          parts
        );
        if (!completed) {
          throw new BlobInvalid('Multipart upload is not supported');
        }
      }
    } else if (hasMultipartInput) {
      throw new BlobInvalid('Multipart upload is not initialized');
    }

    if (!record.reservationId)
      throw new BlobInvalid('Missing blob reservation');
    const finalized = await this.finalizeReservation({
      workspaceId,
      userId: user.id,
      key,
      reservationId: record.reservationId,
      kind: 'blob',
      size: record.size,
      mime: record.mime,
    });
    if (!finalized) throw new BlobInvalid('Blob reservation changed');

    return key;
  }

  @Mutation(() => Boolean)
  async abortBlobUpload(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('key') key: string,
    @Args('uploadId') uploadId: string
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Blobs.Upload');

    const record = await this.models.blob.get(workspaceId, key);
    if (
      !record ||
      record.status !== 'pending' ||
      record.deletedAt ||
      !record.reservationId ||
      record.uploadId !== uploadId
    ) {
      return false;
    }
    const aborted = await this.storage.abortMultipartUpload(
      workspaceId,
      key,
      uploadId,
      record.reservationId
    );
    await this.runtime.abortStorageReservationV1({
      workspaceId,
      userId: user.id,
      key,
      reservationId: record.reservationId,
      kind: 'blob',
    });
    return aborted;
  }

  private async reserveStorage(
    input: Parameters<BackendRuntimeProvider['reserveStorageQuotaV1']>[0]
  ) {
    const reservation = await this.runtime
      .reserveStorageQuotaV1(input)
      .catch(error => {
        this.logger.error(
          { message: 'Failed to reserve blob upload', ...input },
          error
        );
        throw error;
      });
    if (!reservation.allowed) {
      this.logger.warn({
        message: 'Blob upload quota denied',
        ...input,
        reason: reservation.reason,
        limit: reservation.limit,
        current: reservation.current,
      });
      if (reservation.reason === 'blob_limit') throw new BlobQuotaExceeded();
      throw new StorageQuotaExceeded();
    }
    return reservation;
  }

  private async finalizeReservation(
    input: Parameters<BackendRuntimeProvider['finalizeStorageReservationV1']>[0]
  ) {
    try {
      return await this.runtime.finalizeStorageReservationV1(input);
    } catch (error) {
      this.logger.error(
        { message: 'Failed to finalize blob upload', ...input },
        error
      );
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('checksum'))
        throw new BlobInvalid('Blob key mismatch');
      if (message.includes('metadata'))
        throw new BlobInvalid('Blob metadata mismatch');
      if (message.includes('not found')) {
        throw new BlobNotFound({
          spaceId: input.workspaceId,
          blobId: input.key,
        });
      }
      throw error;
    }
  }

  private async getUploadPart(
    user: CurrentUser,
    workspaceId: string,
    key: string,
    uploadId: string,
    partNumber: number
  ): Promise<BlobUploadPart> {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Blobs.Upload');

    const part = await this.storage.presignUploadPart(
      workspaceId,
      key,
      uploadId,
      partNumber
    );
    if (!part) {
      throw new BlobInvalid('Multipart upload is not supported');
    }

    return {
      uploadUrl: part.url,
      headers: part.headers,
      expiresAt: part.expiresAt,
    };
  }

  @Mutation(() => Boolean)
  async deleteBlob(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('hash', {
      type: () => String,
      deprecationReason: 'use parameter [key]',
      nullable: true,
    })
    hash?: string,
    @Args('key', { type: () => String, nullable: true }) key?: string,
    @Args('permanently', { type: () => Boolean, defaultValue: false })
    permanently = false
  ) {
    key = key ?? hash;
    if (!key) {
      return false;
    }

    return this.runtime.manageWorkspaceBlobV1({
      workspaceId,
      actorUserId: user.id,
      key,
      permanently,
    });
  }

  @Mutation(() => Boolean)
  async releaseDeletedBlobs(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    for (;;) {
      const released = await this.runtime.releaseManagedWorkspaceBlobsV1(
        user.id,
        workspaceId,
        1000
      );
      if (released < 1000) break;
    }
    return true;
  }
}
