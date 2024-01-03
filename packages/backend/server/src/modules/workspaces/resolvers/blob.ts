import { ForbiddenException, Logger, UseGuards } from '@nestjs/common';
import {
  Args,
  Float,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';

import { MakeCache, PreventCache } from '../../../cache';
import { CloudThrottlerGuard } from '../../../throttler';
import type { FileUpload } from '../../../types';
import { Auth, CurrentUser } from '../../auth';
import { QuotaManagementService } from '../../quota';
import { WorkspaceBlobStorage } from '../../storage';
import { UserType } from '../../users';
import { PermissionService } from '../permission';
import { Permission } from '../types';
import { WorkspaceBlobSizes, WorkspaceType } from './workspace';

@UseGuards(CloudThrottlerGuard)
@Auth()
@Resolver(() => WorkspaceType)
export class WorkspaceBlobResolver {
  logger = new Logger(WorkspaceBlobResolver.name);
  constructor(
    private readonly permissions: PermissionService,
    private readonly quota: QuotaManagementService,
    private readonly storage: WorkspaceBlobStorage
  ) {}

  @ResolveField(() => Int, {
    description: 'Blobs size of workspace',
    complexity: 2,
  })
  async blobsSize(@Parent() workspace: WorkspaceType) {
    return this.storage.totalSize(workspace.id);
  }

  /**
   * @deprecated use `workspace.blobs` instead
   */
  @Query(() => [String], {
    description: 'List blobs of workspace',
    deprecationReason: 'use `workspace.blobs` instead',
  })
  @MakeCache(['blobs'], ['workspaceId'])
  async listBlobs(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.permissions.checkWorkspace(workspaceId, user.id);

    return this.storage
      .list(workspaceId)
      .then(list => list.map(item => item.key));
  }

  /**
   * @deprecated use `user.storageUsage` instead
   */
  @Query(() => WorkspaceBlobSizes, {
    deprecationReason: 'use `user.storageUsage` instead',
  })
  async collectAllBlobSizes(@CurrentUser() user: UserType) {
    const size = await this.quota.getUserUsage(user.id);
    return { size };
  }

  /**
   * @deprecated mutation `setBlob` will check blob limit & quota usage
   */
  @Query(() => WorkspaceBlobSizes, {
    deprecationReason: 'no more needed',
  })
  async checkBlobSize(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('size', { type: () => Float }) blobSize: number
  ) {
    const canWrite = await this.permissions.tryCheckWorkspace(
      workspaceId,
      user.id,
      Permission.Write
    );
    if (canWrite) {
      const size = await this.quota.checkBlobQuota(workspaceId, blobSize);
      return { size };
    }
    return false;
  }

  @Mutation(() => String)
  @PreventCache(['blobs'], ['workspaceId'])
  async setBlob(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args({ name: 'blob', type: () => GraphQLUpload })
    blob: FileUpload
  ) {
    await this.permissions.checkWorkspace(
      workspaceId,
      user.id,
      Permission.Write
    );

    const { quota, size } = await this.quota.getWorkspaceUsage(workspaceId);

    const checkExceeded = (recvSize: number) => {
      if (!quota) {
        throw new ForbiddenException('cannot find user quota');
      }
      if (size + recvSize > quota) {
        this.logger.log(
          `storage size limit exceeded: ${size + recvSize} > ${quota}`
        );
        return true;
      } else {
        return false;
      }
    };

    if (checkExceeded(0)) {
      throw new ForbiddenException('storage size limit exceeded');
    }
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const stream = blob.createReadStream();
      const chunks: Uint8Array[] = [];
      stream.on('data', chunk => {
        chunks.push(chunk);

        // check size after receive each chunk to avoid unnecessary memory usage
        const bufferSize = chunks.reduce((acc, cur) => acc + cur.length, 0);
        if (checkExceeded(bufferSize)) {
          reject(new ForbiddenException('storage size limit exceeded'));
        }
      });
      stream.on('error', reject);
      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);

        if (checkExceeded(buffer.length)) {
          reject(new ForbiddenException('storage size limit exceeded'));
        } else {
          resolve(buffer);
        }
      });
    });

    if (!(await this.quota.checkBlobQuota(workspaceId, buffer.length))) {
      throw new ForbiddenException('blob size limit exceeded');
    }

    await this.storage.put(workspaceId, blob.filename, buffer);
    return blob.filename;
  }

  @Mutation(() => Boolean)
  @PreventCache(['blobs'], ['workspaceId'])
  async deleteBlob(
    @CurrentUser() user: UserType,
    @Args('workspaceId') workspaceId: string,
    @Args('hash') name: string
  ) {
    await this.permissions.checkWorkspace(workspaceId, user.id);

    await this.storage.delete(workspaceId, name);

    return true;
  }
}
