/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';

import { S3StorageConfig } from '../../../config/storage';
import {
  BlobInputType,
  GetObjectMetadata,
  ListObjectsMetadata,
  PutObjectMetadata,
  StorageProvider,
} from './provider';
import { autoMetadata, toBuffer } from './utils';

export class S3StorageProvider implements StorageProvider {
  logger: Logger;
  client: S3Client;
  constructor(
    config: S3StorageConfig,
    public readonly bucket: string
  ) {
    this.client = new S3Client(config);
    this.logger = new Logger(`${S3StorageProvider.name}:${bucket}`);
  }

  async put(
    key: string,
    body: BlobInputType,
    metadata: PutObjectMetadata = {}
  ): Promise<void> {
    const blob = await toBuffer(body);

    metadata = await autoMetadata(blob, metadata);

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,

          // metadata
          ContentType: metadata.contentType,
          ContentLength: metadata.contentLength,
          ChecksumCRC32: metadata.checksumCRC32,
        })
      );

      this.logger.verbose(`Object \`${key}\` put`);
    } catch (e) {
      throw new Error(`Failed to put object \`${key}\``, {
        cause: e,
      });
    }
  }

  async get(key: string): Promise<{
    body?: Readable;
    metadata?: GetObjectMetadata;
  }> {
    try {
      const obj = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      if (!obj.Body) {
        this.logger.verbose(`Object \`${key}\` not found`);
        return {};
      }

      this.logger.verbose(`Read object \`${key}\``);
      return {
        // @ts-expect-errors ignore browser response type `Blob`
        body: obj.Body,
        metadata: {
          // always set when putting object
          contentType: obj.ContentType!,
          contentLength: obj.ContentLength!,
          checksumCRC32: obj.ChecksumCRC32!,
          lastModified: obj.LastModified!,
        },
      };
    } catch (e) {
      throw new Error(`Failed to read object \`${key}\``, {
        cause: e,
      });
    }
  }

  async list(prefix?: string): Promise<ListObjectsMetadata[]> {
    // continuationToken should be `string | undefined`,
    // but TypeScript will fail on type infer in the code below.
    // Seems to be a bug in TypeScript
    let continuationToken: any = undefined;
    let hasMore = true;
    let result: ListObjectsMetadata[] = [];

    try {
      while (hasMore) {
        const listResult = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          })
        );

        if (listResult.Contents?.length) {
          result = result.concat(
            listResult.Contents.map(r => ({
              key: r.Key!,
              lastModified: r.LastModified!,
              size: r.Size!,
            }))
          );
        }

        // has more items not listed
        hasMore = !!listResult.IsTruncated;
        continuationToken = listResult.NextContinuationToken;
      }

      this.logger.verbose(
        `List ${result.length} objects with prefix \`${prefix}\``
      );
      return result;
    } catch (e) {
      throw new Error(`Failed to list objects with prefix \`${prefix}\``, {
        cause: e,
      });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
    } catch (e) {
      throw new Error(`Failed to delete object \`${key}\``, {
        cause: e,
      });
    }
  }
}
