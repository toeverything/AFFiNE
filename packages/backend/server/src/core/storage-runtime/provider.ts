import { Readable } from 'node:stream';

import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import type {
  BlobOutputType,
  GetObjectMetadata,
  ListObjectsMetadata,
  PresignedUpload,
  PutObjectMetadata,
} from '../../base';
import { Config, OnEvent } from '../../base';
import { wrapCallMetric } from '../../base/metrics';
import {
  type RuntimeObjectGetResult,
  type RuntimeObjectListEntry,
  type RuntimeObjectMetadata,
  type RuntimePresignedObjectRequest,
  type StorageProviderCapabilities,
  StorageRuntime,
  type StorageRuntimeHealth,
} from '../../native';

type RuntimeInstance = InstanceType<typeof StorageRuntime>;

@Injectable()
export class StorageRuntimeProvider
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(StorageRuntimeProvider.name);
  private readonly runtime: RuntimeInstance = new StorageRuntime();
  private migrationsStarted = false;

  constructor(private readonly config: Config) {}

  async onApplicationBootstrap() {
    await this.start();
  }

  async onApplicationShutdown() {
    await this.stop();
  }

  async start() {
    this.configureRuntime();
    await this.runtime.start();
    await this.runMigrationsOnce();
    const health = await this.runtime.health();
    this.logger.log(
      `storage runtime started: db=${health.databaseConnected} provider=${health.provider ?? 'none'}`
    );
  }

  async stop() {
    await this.runtime.stop();
    this.logger.log('storage runtime stopped');
  }

  @OnEvent('config.init')
  async onConfigInit() {
    await this.start();
  }

  @OnEvent('config.changed')
  async onConfigChanged({ updates }: Events['config.changed']) {
    if (
      !('storages' in updates) &&
      !('db' in updates) &&
      !updates.copilot?.storage
    ) {
      return;
    }
    await this.restart();
  }

  async health(): Promise<StorageRuntimeHealth> {
    return await this.runtime.health();
  }

  async providerCapabilities(
    scope: string
  ): Promise<StorageProviderCapabilities> {
    return await this.measured('providerCapabilities', rt =>
      rt.providerCapabilities(scope)
    );
  }

  async putObject(
    scope: string,
    key: string,
    body: Buffer,
    metadata?: PutObjectMetadata
  ) {
    const result = await this.measured('putObject', rt =>
      rt.putObject(scope, key, body, toRuntimeMetadata(metadata))
    );
    return fromRuntimeMetadata(result);
  }

  async headObject(scope: string, key: string) {
    const metadata = await this.measured('headObject', rt =>
      rt.headObject(scope, key)
    );
    return metadata ? fromRuntimeMetadata(metadata) : undefined;
  }

  async getObject(
    scope: string,
    key: string
  ): Promise<StorageRuntimeGetObjectResult> {
    const result = await this.measured('getObject', rt =>
      rt.getObject(scope, key)
    );
    return result ? fromRuntimeGetResult(result) : {};
  }

  async listObjects(scope: string, prefix?: string) {
    const entries = await this.measured('listObjects', rt =>
      rt.listObjects(scope, prefix)
    );
    return entries.map(fromRuntimeListEntry);
  }

  async deleteObject(scope: string, key: string) {
    await this.measured('deleteObject', rt => rt.deleteObject(scope, key));
  }

  async presignPut(scope: string, key: string, metadata?: PutObjectMetadata) {
    const result = await this.measured('presignPut', rt =>
      rt.presignPut(scope, key, toRuntimeMetadata(metadata))
    );
    return result ? fromRuntimePresigned(result) : undefined;
  }

  async presignGet(scope: string, key: string) {
    const result = await this.measured('presignGet', rt =>
      rt.presignGet(scope, key)
    );
    return result ? fromRuntimePresigned(result) : undefined;
  }

  async createMultipartUpload(
    scope: string,
    key: string,
    metadata?: PutObjectMetadata
  ) {
    const result = await this.measured('createMultipartUpload', rt =>
      rt.createMultipartUpload(scope, key, toRuntimeMetadata(metadata))
    );
    return result
      ? { uploadId: result.uploadId, expiresAt: new Date(result.expiresAtMs) }
      : undefined;
  }

  async presignUploadPart(
    scope: string,
    key: string,
    uploadId: string,
    partNumber: number
  ) {
    const result = await this.measured('presignUploadPart', rt =>
      rt.presignUploadPart(scope, key, uploadId, partNumber)
    );
    return result ? fromRuntimePresigned(result) : undefined;
  }

  async listMultipartUploadParts(scope: string, key: string, uploadId: string) {
    return (
      (await this.measured('listMultipartUploadParts', rt =>
        rt.listMultipartUploadParts(scope, key, uploadId)
      )) ?? undefined
    );
  }

  async proxyUploadPart(
    scope: string,
    key: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
    contentLength?: number
  ) {
    return (
      (await this.measured('proxyUploadPart', rt =>
        rt.proxyUploadPart(
          scope,
          key,
          uploadId,
          partNumber,
          body,
          contentLength
        )
      )) ?? undefined
    );
  }

  async completeMultipartUpload(
    scope: string,
    key: string,
    uploadId: string,
    parts: { partNumber: number; etag: string }[]
  ) {
    return await this.measured('completeMultipartUpload', rt =>
      rt.completeMultipartUpload(scope, key, uploadId, parts)
    );
  }

  async abortMultipartUpload(scope: string, key: string, uploadId: string) {
    return await this.measured('abortMultipartUpload', rt =>
      rt.abortMultipartUpload(scope, key, uploadId)
    );
  }

  async completeWorkspaceBlobUpload(
    workspaceId: string,
    key: string,
    expected: { size: number; mime: string }
  ) {
    return await this.measured('completeWorkspaceBlobUpload', rt =>
      rt.completeWorkspaceBlobUpload(
        workspaceId,
        key,
        expected.size,
        expected.mime
      )
    );
  }

  async cleanupExpiredPendingBlobs(cutoffMs: number, limit: number) {
    return await this.measured('cleanupExpiredPendingBlobs', rt =>
      rt.cleanupExpiredPendingBlobs(cutoffMs, limit)
    );
  }

  async releaseDeletedBlobs(workspaceId: string, limit: number) {
    return await this.measured('releaseDeletedBlobs', rt =>
      rt.releaseDeletedBlobs(workspaceId, limit)
    );
  }

  async backfillMissingBlobMetadata(
    workspaceId: string | null | undefined,
    limit: number
  ) {
    return await this.measured('backfillMissingBlobMetadata', rt =>
      rt.backfillMissingBlobMetadata(workspaceId, limit)
    );
  }

  async rebuildWorkspaceDocBlobRefs(workspaceId: string, limit: number) {
    return await this.measured('rebuildWorkspaceDocBlobRefs', rt =>
      rt.rebuildWorkspaceDocBlobRefs(workspaceId, limit)
    );
  }

  async planUnreferencedWorkspaceBlobs(
    workspaceId: string,
    gracePeriodDays: number,
    limit: number
  ) {
    return await this.measured('planUnreferencedWorkspaceBlobs', rt =>
      rt.planUnreferencedWorkspaceBlobs(workspaceId, gracePeriodDays, limit)
    );
  }

  async executeBlobCleanupCandidates(
    runId: string,
    gracePeriodDays: number,
    limit: number
  ) {
    return await this.measured('executeBlobCleanupCandidates', rt =>
      rt.executeBlobCleanupCandidates(runId, gracePeriodDays, limit)
    );
  }

  private async measured<T>(
    method: string,
    fn: (runtime: RuntimeInstance) => Promise<T>
  ): Promise<T> {
    return await wrapCallMetric(() => fn(this.runtime), 'storage', 'runtime', {
      method,
    })();
  }

  private async runMigrationsOnce() {
    if (this.migrationsStarted) {
      return;
    }
    await this.runtime.runMigrations();
    this.migrationsStarted = true;
  }

  private async restart() {
    await this.runtime.stop();
    this.migrationsStarted = false;
    await this.start();
  }

  private configureRuntime() {
    this.runtime.configure(
      JSON.stringify({
        db: {
          datasourceUrl: this.config.db.datasourceUrl,
        },
        storages: {
          'blob.storage': this.config.storages.blob.storage,
          'avatar.storage': this.config.storages.avatar.storage,
        },
        copilot: {
          storage: this.config.copilot.storage,
        },
      })
    );
  }
}

function toRuntimeMetadata(metadata?: PutObjectMetadata) {
  return metadata
    ? {
        contentType: metadata.contentType,
        contentLength: metadata.contentLength,
        checksumCrc32: metadata.checksumCRC32,
      }
    : undefined;
}

function fromRuntimeMetadata(
  metadata: RuntimeObjectMetadata
): GetObjectMetadata {
  return {
    contentType: metadata.contentType,
    contentLength: metadata.contentLength,
    lastModified: new Date(metadata.lastModifiedMs),
    checksumCRC32: metadata.checksumCrc32,
  };
}

function fromRuntimeGetResult(result: RuntimeObjectGetResult) {
  return {
    body: Readable.from(result.body),
    metadata: fromRuntimeMetadata(result.metadata),
  };
}

function fromRuntimeListEntry(
  entry: RuntimeObjectListEntry
): ListObjectsMetadata {
  return {
    key: entry.key,
    contentLength: entry.contentLength,
    lastModified: new Date(entry.lastModifiedMs),
  };
}

function fromRuntimePresigned(
  request: RuntimePresignedObjectRequest
): PresignedUpload {
  return {
    url: request.url,
    headers: JSON.parse(request.headersJson) as Record<string, string>,
    expiresAt: new Date(request.expiresAtMs),
  };
}

export type StorageRuntimeGetObjectResult = {
  redirectUrl?: string;
  body?: BlobOutputType;
  metadata?: GetObjectMetadata;
};
