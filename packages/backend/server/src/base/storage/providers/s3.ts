/* oxlint-disable @typescript-eslint/no-non-null-assertion */
import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger } from '@nestjs/common';

import {
  BlobInputType,
  GetObjectMetadata,
  ListObjectsMetadata,
  PutObjectMetadata,
  StorageProvider,
} from './provider';
import { autoMetadata, SIGNED_URL_EXPIRED, toBuffer } from './utils';

export interface S3StorageConfig extends S3ClientConfig {
  usePresignedURL?: {
    enabled: boolean;
  };
}

export class S3StorageProvider implements StorageProvider {
  protected logger: Logger;
  protected client: S3Client;
  private readonly usePresignedURL: boolean;

  constructor(
    config: S3StorageConfig,
    public readonly bucket: string
  ) {
    const { usePresignedURL, ...clientConfig } = config;
    this.client = new S3Client({
      region: 'auto',
      // s3 client uses keep-alive by default to accelerate requests, and max requests queue is 50.
      // If some of them are long holding or dead without response, the whole queue will block.
      // By default no timeout is set for requests or connections, so we set them here.
      requestHandler: { requestTimeout: 60_000, connectionTimeout: 10_000 },
      ...clientConfig,
    });
    this.usePresignedURL = usePresignedURL?.enabled ?? false;
    this.logger = new Logger(`${S3StorageProvider.name}:${bucket}`);
  }

  async put(
    key: string,
    body: BlobInputType,
    metadata: PutObjectMetadata = {}
  ): Promise<void> {
    const blob = await toBuffer(body);

    metadata = autoMetadata(blob, metadata);

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
      this.logger.error(
        `Failed to put object (${JSON.stringify({
          key,
          bucket: this.bucket,
          metadata,
        })})`
      );
      throw e;
    }
  }

  async head(key: string) {
    try {
      const obj = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      return {
        contentType: obj.ContentType!,
        contentLength: obj.ContentLength!,
        lastModified: obj.LastModified!,
        checksumCRC32: obj.ChecksumCRC32,
      };
    } catch (e) {
      // 404
      if (e instanceof NoSuchKey || e instanceof NotFound) {
        this.logger.verbose(`Object \`${key}\` not found`);
        return undefined;
      }
      this.logger.error(`Failed to head object \`${key}\``);
      throw e;
    }
  }

  async get(
    key: string,
    signedUrl?: boolean
  ): Promise<{
    body?: Readable;
    metadata?: GetObjectMetadata;
    redirectUrl?: string;
  }> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      if (this.usePresignedURL && signedUrl) {
        const metadata = await this.head(key);
        if (metadata) {
          const url = await getSignedUrl(
            this.client,
            new GetObjectCommand({
              Bucket: this.bucket,
              Key: key,
            }),
            { expiresIn: SIGNED_URL_EXPIRED }
          );

          return {
            redirectUrl: url,
            metadata,
          };
        }

        // object not found
        return {};
      }

      const obj = await this.client.send(command);

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
      }
      this.logger.error(`Failed to read object \`${key}\``);
      throw e;
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
      this.logger.error(`Failed to list objects with prefix \`${prefix}\``);
      throw e;
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

      this.logger.verbose(`Deleted object \`${key}\``);
    } catch (e) {
      this.logger.error(`Failed to delete object \`${key}\``);
      throw e;
    }
  }
}
