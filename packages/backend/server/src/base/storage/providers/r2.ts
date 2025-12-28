import assert from 'node:assert';
import { Readable } from 'node:stream';

import { PutObjectCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { Logger } from '@nestjs/common';

import {
  GetObjectMetadata,
  PresignedUpload,
  PutObjectMetadata,
} from './provider';
import { S3StorageConfig, S3StorageProvider } from './s3';
import {
  PROXY_MULTIPART_PATH,
  PROXY_UPLOAD_PATH,
  SIGNED_URL_EXPIRED,
} from './utils';

export interface R2StorageConfig extends S3StorageConfig {
  accountId: string;
  usePresignedURL?: {
    enabled: boolean;
    urlPrefix?: string;
    signKey?: string;
  };
}

export class R2StorageProvider extends S3StorageProvider {
  private readonly encoder = new TextEncoder();
  private readonly key: Uint8Array;

  constructor(
    private readonly config: R2StorageConfig,
    bucket: string
  ) {
    assert(config.accountId, 'accountId is required for R2 storage provider');
    super(
      {
        ...config,
        forcePathStyle: true,
        endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
        // see https://github.com/aws/aws-sdk-js-v3/issues/6810
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      },
      bucket
    );
    this.logger = new Logger(`${R2StorageProvider.name}:${bucket}`);
    this.key = this.encoder.encode(config.usePresignedURL?.signKey ?? '');
  }

  private get shouldUseProxyUpload() {
    const { usePresignedURL } = this.config;
    return (
      !!usePresignedURL?.enabled &&
      !!usePresignedURL.signKey &&
      this.key.length > 0
    );
  }

  private parseWorkspaceKey(fullKey: string) {
    const [workspaceId, ...rest] = fullKey.split('/');
    if (!workspaceId || rest.length !== 1) {
      return null;
    }
    return { workspaceId, key: rest.join('/') };
  }

  private async signPayload(payload: string) {
    const key = await crypto.subtle.importKey(
      'raw',
      this.key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );
    const mac = await crypto.subtle.sign(
      'HMAC',
      key,
      this.encoder.encode(payload)
    );

    return Buffer.from(mac).toString('base64');
  }

  private async signUrl(url: URL): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const base64Mac = await this.signPayload(`${url.pathname}${timestamp}`);
    url.searchParams.set('sign', `${timestamp}-${base64Mac}`);
    return url.toString();
  }

  private async createProxyUrl(
    path: string,
    canonicalFields: (string | number | undefined)[],
    query: Record<string, string | number | undefined>
  ) {
    const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_EXPIRED;
    const canonical = [
      path,
      ...canonicalFields.map(field =>
        field === undefined ? '' : field.toString()
      ),
      exp.toString(),
    ].join('\n');
    const token = await this.signPayload(canonical);

    const url = new URL(`http://localhost${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, value.toString());
    }
    url.searchParams.set('exp', exp.toString());
    url.searchParams.set('token', `${exp}-${token}`);

    return { url: url.pathname + url.search, expiresAt: new Date(exp * 1000) };
  }

  override async presignPut(
    key: string,
    metadata: PutObjectMetadata = {}
  ): Promise<PresignedUpload | undefined> {
    if (!this.shouldUseProxyUpload) {
      return super.presignPut(key, metadata);
    }

    const parsed = this.parseWorkspaceKey(key);
    if (!parsed) {
      return super.presignPut(key, metadata);
    }

    const contentType = metadata.contentType ?? 'application/octet-stream';
    const { url, expiresAt } = await this.createProxyUrl(
      PROXY_UPLOAD_PATH,
      [parsed.workspaceId, parsed.key, contentType, metadata.contentLength],
      {
        workspaceId: parsed.workspaceId,
        key: parsed.key,
        contentType,
        contentLength: metadata.contentLength,
      }
    );

    return {
      url,
      headers: { 'Content-Type': contentType },
      expiresAt,
    };
  }

  override async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number
  ): Promise<PresignedUpload | undefined> {
    if (!this.shouldUseProxyUpload) {
      return super.presignUploadPart(key, uploadId, partNumber);
    }

    const parsed = this.parseWorkspaceKey(key);
    if (!parsed) {
      return super.presignUploadPart(key, uploadId, partNumber);
    }

    return this.createProxyUrl(
      PROXY_MULTIPART_PATH,
      [parsed.workspaceId, parsed.key, uploadId, partNumber],
      {
        workspaceId: parsed.workspaceId,
        key: parsed.key,
        uploadId,
        partNumber,
      }
    );
  }

  async proxyPutObject(
    key: string,
    body: Readable | Buffer | Uint8Array | string,
    options: { contentType?: string; contentLength?: number } = {}
  ) {
    return this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType,
        ContentLength: options.contentLength,
      })
    );
  }

  async proxyUploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Readable | Buffer | Uint8Array | string,
    options: { contentLength?: number } = {}
  ) {
    const result = await this.client.send(
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
        Body: body,
        ContentLength: options.contentLength,
      })
    );

    return result.ETag;
  }

  override async get(
    key: string,
    signedUrl?: boolean
  ): Promise<{
    body?: Readable;
    metadata?: GetObjectMetadata;
    redirectUrl?: string;
  }> {
    const { usePresignedURL: { enabled, urlPrefix } = {} } = this.config;
    if (signedUrl && enabled && urlPrefix) {
      const metadata = await this.head(key);
      const url = await this.signUrl(new URL(`/${key}`, urlPrefix));
      if (metadata) {
        return {
          redirectUrl: url.toString(),
          metadata,
        };
      }

      // object not found
      return {};
    }

    // fallback to s3 get
    return super.get(key, signedUrl);
  }
}
