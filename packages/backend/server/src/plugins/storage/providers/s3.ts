/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';

import {
  autoMetadata,
  BlobInputType,
  GetObjectMetadata,
  ListObjectsMetadata,
  PutObjectMetadata,
  StorageProvider,
  toBuffer,
} from '../../../fundamentals/storage';
import type { S3StorageConfig } from '../config';

export class S3StorageProvider implements StorageProvider {
  protected logger: Logger;
  protected client: S3Client;

  readonly type = 'aws-s3';

  constructor(
    config: S3StorageConfig,
    public readonly bucket: string
  ) {
    this.client = new S3Client({
      region: 'auto',
      // s3 client uses keep-alive by default to accelrate requests, and max requests queue is 50.
      // If some of them are long holding or dead without response, the whole queue will block.
      // By default no timeout is set for requests or connections, so we set them here.
      requestHandler: { requestTimeout: 60_000, connectionTimeout: 10_000 },
      ...config,
    });
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
          Body: blob,

          // metadata
          ContentType: metadata.contentType,
          ContentLength: metadata.contentLength,
          // TODO(@forehalo): Cloudflare doesn't support CRC32, use md5 instead later.
          // ChecksumCRC32: metadata.checksumCRC32,
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
          lastModified: obj.LastModified!,
          checksumCRC32: obj.ChecksumCRC32,
        },
      };
    } catch (e) {
      // 404
      if (e instanceof NoSuchKey) {
        this.logger.verbose(`Object \`${key}\` not found`);
        return {};
      } else {
        throw new Error(`Failed to read object \`${key}\``, {
          cause: e,
        });
      }
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
              contentLength: r.Size!,
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
