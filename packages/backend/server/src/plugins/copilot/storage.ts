import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import { CurrentUser } from '../../core/auth';
import { QuotaManagementService } from '../../core/quota';
import { PermissionService } from '../../core/workspaces/permission';
import {
  type BlobInputType,
  FileUpload,
  MutexService,
  type StorageProvider,
  StorageProviderFactory,
  TooManyRequestsException,
} from '../../fundamentals';
import { COPILOT_LOCKER, CopilotType } from './resolver';

@Injectable()
export class CopilotStorage {
  public readonly provider: StorageProvider;

  constructor(private readonly storageFactory: StorageProviderFactory) {
    this.provider = this.storageFactory.create('copilot');
  }

  async put(
    userId: string,
    workspaceId: string,
    key: string,
    blob: BlobInputType
  ) {
    await this.provider.put(`${userId}/${workspaceId}/${key}`, blob);
  }

  async get(userId: string, workspaceId: string, key: string) {
    return this.provider.get(`${userId}/${workspaceId}/${key}`);
  }

  async delete(userId: string, workspaceId: string, key: string) {
    return this.provider.delete(`${userId}/${workspaceId}/${key}`);
  }
}

@Resolver(() => CopilotType)
export class CopilotStorageResolver {
  constructor(
    private readonly permissions: PermissionService,
    private readonly mutex: MutexService,
    private readonly quota: QuotaManagementService,
    private readonly storage: CopilotStorage
  ) {}

  @Mutation(() => String)
  async setCopilotBlob(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('docId') docId: string,
    @Args({ name: 'blob', type: () => GraphQLUpload })
    blob: FileUpload
  ) {
    await this.permissions.checkCloudPagePermission(
      workspaceId,
      docId,
      user.id
    );
    const lockFlag = `${COPILOT_LOCKER}:session:${user.id}:${workspaceId}`;
    await using lock = await this.mutex.lock(lockFlag);
    if (!lock) {
      return new TooManyRequestsException('Server is busy');
    }

    const checkExceeded = await this.quota.getQuotaCalculator(user.id);

    if (checkExceeded(0)) {
      throw new PayloadTooLargeException(
        'Storage or blob size limit exceeded.'
      );
    }
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const stream = blob.createReadStream();
      const chunks: Uint8Array[] = [];
      stream.on('data', chunk => {
        chunks.push(chunk);

        // check size after receive each chunk to avoid unnecessary memory usage
        const bufferSize = chunks.reduce((acc, cur) => acc + cur.length, 0);
        if (checkExceeded(bufferSize)) {
          reject(
            new PayloadTooLargeException('Storage or blob size limit exceeded.')
          );
        }
      });
      stream.on('error', reject);
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);

        if (checkExceeded(buffer.length)) {
          reject(new PayloadTooLargeException('Storage limit exceeded.'));
        } else {
          resolve(buffer);
        }
      });
    });

    await this.storage.put(user.id, workspaceId, blob.filename, buffer);
    return blob.filename;
  }
}
