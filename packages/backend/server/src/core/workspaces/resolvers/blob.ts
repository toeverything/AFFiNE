import { Logger, UseGuards } from '@nestjs/common';
import {
  Args,
  Field,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Parent,
  Query,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-scalars';
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
import { AccessController } from '../../permission';
import { QuotaService } from '../../quota';
import { WorkspaceBlobStorage } from '../../storage';
import {
  MULTIPART_PART_SIZE,
  MULTIPART_THRESHOLD,
} from '../../storage/constants';
import { WorkspaceBlobSizes, WorkspaceType } from '../types';

enum BlobUploadMethod {
  GRAPHQL = 'GRAPHQL',
  PRESIGNED = 'PRESIGNED',
  MULTIPART = 'MULTIPART',
}

registerEnumType(BlobUploadMethod, {
  name: 'BlobUploadMethod',
  description: 'Blob upload method',
});

@ObjectType()
class BlobUploadedPart {
  @Field(() => Int)
  partNumber!: number;

  @Field()
  etag!: string;
}

@ObjectType()
class BlobUploadInit {
  @Field(() => BlobUploadMethod)
  method!: BlobUploadMethod;

  @Field()
  blobKey!: string;

  @Field(() => Boolean, { nullable: true })
  alreadyUploaded?: boolean;

  @Field(() => String, { nullable: true })
  uploadUrl?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  headers?: Record<string, string>;

  @Field(() => Date, { nullable: true })
  expiresAt?: Date;

  @Field(() => String, { nullable: true })
  uploadId?: string;

  @Field(() => Int, { nullable: true })
  partSize?: number;

  @Field(() => [BlobUploadedPart], { nullable: true })
  uploadedParts?: BlobUploadedPart[];
}

@ObjectType()
class BlobUploadPart {
  @Field()
  uploadUrl!: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  headers?: Record<string, string>;

  @Field(() => Date, { nullable: true })
  expiresAt?: Date;
}

@InputType()
class BlobUploadPartInput {
  @Field(() => Int)
  partNumber!: number;

  @Field()
  etag!: string;
}

@ObjectType()
class ListedBlob {
  @Field()
  key!: string;

  @Field()
  mime!: string;

  @Field()
  size!: number;

  @Field()
  createdAt!: string;
}

@UseGuards(CloudThrottlerGuard)
@Resolver(() => WorkspaceType)
export class WorkspaceBlobResolver {
  logger = new Logger(WorkspaceBlobResolver.name);
  constructor(
    private readonly ac: AccessController,
    private readonly quota: QuotaService,
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
    await this.ac
      .user(user.id)
      .workspace(workspace.id)
      .assert('Workspace.Blobs.List');

    return this.storage.list(workspace.id);
  }

  @ResolveField(() => Int, {
    description: 'Blobs size of workspace',
    complexity: 2,
  })
  async blobsSize(@Parent() workspace: WorkspaceType) {
    return this.storage.totalSize(workspace.id);
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

  @Query(() => WorkspaceBlobSizes, {
    deprecationReason: 'use `user.quotaUsage` instead',
  })
  async collectAllBlobSizes(@CurrentUser() user: CurrentUser) {
    const size = await this.quota.getUserStorageUsage(user.id);
    return { size };
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
      .assert('Workspace.Blobs.Write');

    const checkExceeded =
      await this.quota.getWorkspaceQuotaCalculator(workspaceId);

    let result = checkExceeded(0);
    if (result?.blobQuotaExceeded) {
      throw new BlobQuotaExceeded();
    } else if (result?.storageQuotaExceeded) {
      throw new StorageQuotaExceeded();
    }

    const buffer = await readBuffer(blob.createReadStream(), checkExceeded);

    await this.storage.put(workspaceId, blob.filename, buffer);
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
      .assert('Workspace.Blobs.Write');

    let record = await this.models.blob.get(workspaceId, key);
    mime = mime || 'application/octet-stream';
    if (record) {
      if (record.size !== size) {
        throw new BlobInvalid('Blob size mismatch');
      }
      if (record.mime !== mime) {
        throw new BlobInvalid('Blob mime mismatch');
      }

      if (record.status === 'completed') {
        const existingMetadata = await this.storage.head(workspaceId, key);
        if (!existingMetadata) {
          // record exists but object is missing, treat as a new upload
          record = null;
        } else if (existingMetadata.contentLength !== size) {
          throw new BlobInvalid('Blob size mismatch');
        } else if (existingMetadata.contentType !== mime) {
          throw new BlobInvalid('Blob mime mismatch');
        } else {
          return {
            method: BlobUploadMethod.GRAPHQL,
            blobKey: key,
            alreadyUploaded: true,
          };
        }
      }
    }

    const checkExceeded =
      await this.quota.getWorkspaceQuotaCalculator(workspaceId);
    const result = checkExceeded(record ? 0 : size);
    if (result?.blobQuotaExceeded) {
      throw new BlobQuotaExceeded();
    } else if (result?.storageQuotaExceeded) {
      throw new StorageQuotaExceeded();
    }

    const metadata = { contentType: mime, contentLength: size };
    let init: BlobUploadInit | null = null;
    let uploadIdForRecord: string | null = null;

    // try to resume multipart uploads
    if (record && record.uploadId) {
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

    if (size >= MULTIPART_THRESHOLD) {
      const multipart = await this.storage.createMultipartUpload(
        workspaceId,
        key,
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

    if (!init) {
      const presigned = await this.storage.presignPut(
        workspaceId,
        key,
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

    if (!init) {
      init = {
        method: BlobUploadMethod.GRAPHQL,
        blobKey: key,
      };
    }

    await this.models.blob.upsert({
      workspaceId,
      key,
      mime,
      size,
      status: 'pending',
      uploadId: uploadIdForRecord,
    });

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
      .assert('Workspace.Blobs.Write');

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

    const result = await this.storage.complete(workspaceId, key, {
      size: record.size,
      mime: record.mime,
    });
    if (!result.ok) {
      if (result.reason === 'not_found') {
        throw new BlobNotFound({
          spaceId: workspaceId,
          blobId: key,
        });
      }
      if (result.reason === 'size_mismatch') {
        throw new BlobInvalid('Blob size mismatch');
      }
      if (result.reason === 'mime_mismatch') {
        throw new BlobInvalid('Blob mime mismatch');
      }
      throw new BlobInvalid('Blob key mismatch');
    }

    return key;
  }

  @Mutation(() => BlobUploadPart, {
    deprecationReason: 'use WorkspaceType.blobUploadPartUrl',
  })
  async getBlobUploadPartUrl(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('key') key: string,
    @Args('uploadId') uploadId: string,
    @Args('partNumber', { type: () => Int }) partNumber: number
  ): Promise<BlobUploadPart> {
    return this.getUploadPart(user, workspaceId, key, uploadId, partNumber);
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
      .assert('Workspace.Blobs.Write');

    return this.storage.abortMultipartUpload(workspaceId, key, uploadId);
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
      .assert('Workspace.Blobs.Write');

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

    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Blobs.Write');

    await this.storage.delete(workspaceId, key, permanently);

    return true;
  }

  @Mutation(() => Boolean)
  async releaseDeletedBlobs(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.ac
      .user(user.id)
      .workspace(workspaceId)
      .assert('Workspace.Blobs.Write');

    await this.storage.release(workspaceId);

    return true;
  }
}
