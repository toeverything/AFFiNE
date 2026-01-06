/* oxlint-disable @typescript-eslint/no-non-null-assertion */
import { Readable } from 'node:stream';

import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  NoSuchKey,
  NoSuchUpload,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger } from '@nestjs/common';

import {
  BlobInputType,
  GetObjectMetadata,
  ListObjectsMetadata,
  MultipartUploadInit,
  MultipartUploadPart,
  PresignedUpload,
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

  async presignPut(
    key: string,
    metadata: PutObjectMetadata = {}
  ): Promise<PresignedUpload | undefined> {
    try {
      const contentType = metadata.contentType ?? 'application/octet-stream';
      const url = await getSignedUrl(
        this.client,
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: contentType,
        }),
        { expiresIn: SIGNED_URL_EXPIRED }
      );

      return {
        url,
        headers: { 'Content-Type': contentType },
        expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRED * 1000),
      };
    } catch (e) {
      this.logger.error(
        `Failed to presign put object (${JSON.stringify({
          key,
          bucket: this.bucket,
          metadata,
        })}`
      );
      throw e;
    }
  }

  async createMultipartUpload(
    key: string,
    metadata: PutObjectMetadata = {}
  ): Promise<MultipartUploadInit | undefined> {
    try {
      const contentType = metadata.contentType ?? 'application/octet-stream';
      const response = await this.client.send(
        new CreateMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          ContentType: contentType,
        })
      );

      if (!response.UploadId) {
        return;
      }

      return {
        uploadId: response.UploadId,
        expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRED * 1000),
      };
    } catch (e) {
      this.logger.error(
        `Failed to create multipart upload (${JSON.stringify({
          key,
          bucket: this.bucket,
          metadata,
        })}`
      );
      throw e;
    }
  }

  async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number
  ): Promise<PresignedUpload | undefined> {
    try {
      const url = await getSignedUrl(
        this.client,
        new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: SIGNED_URL_EXPIRED }
      );

      return {
        url,
        expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRED * 1000),
      };
    } catch (e) {
      this.logger.error(
        `Failed to presign upload part (${JSON.stringify({ key, bucket: this.bucket, uploadId, partNumber })}`
      );
      throw e;
    }
  }

  async listMultipartUploadParts(
    key: string,
    uploadId: string
  ): Promise<MultipartUploadPart[] | undefined> {
    const parts: MultipartUploadPart[] = [];
    let partNumberMarker: string | undefined;

    try {
      // ListParts is paginated by part number marker
      // https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListParts.html
      // R2 follows S3 semantics here.
      while (true) {
        const response = await this.client.send(
          new ListPartsCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumberMarker: partNumberMarker,
          })
        );

        for (const part of response.Parts ?? []) {
          if (!part.PartNumber || !part.ETag) {
            continue;
          }
          parts.push({ partNumber: part.PartNumber, etag: part.ETag });
        }

        if (!response.IsTruncated) {
          break;
        }

        if (response.NextPartNumberMarker === undefined) {
          break;
        }

        partNumberMarker = response.NextPartNumberMarker;
      }

      return parts;
    } catch (e) {
      // the upload may have been aborted/expired by provider lifecycle rules
      if (e instanceof NoSuchUpload || e instanceof NotFound) {
        return undefined;
      }
      this.logger.error(`Failed to list multipart upload parts for \`${key}\``);
      throw e;
    }
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: MultipartUploadPart[]
  ): Promise<void> {
    try {
      const orderedParts = [...parts].sort(
        (left, right) => left.partNumber - right.partNumber
      );

      await this.client.send(
        new CompleteMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: orderedParts.map(part => ({
              ETag: part.etag,
              PartNumber: part.partNumber,
            })),
          },
        })
      );
    } catch (e) {
      this.logger.error(`Failed to complete multipart upload for \`${key}\``);
      throw e;
    }
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
        })
      );
    } catch (e) {
      this.logger.error(`Failed to abort multipart upload for \`${key}\``);
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
          contentType: obj.ContentType ?? 'application/octet-stream',
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
      this.logger.error(`Failed to delete object \`${key}\``, {
        bucket: this.bucket,
        key,
        cause: e,
      });
      throw e;
    }
  }
}
