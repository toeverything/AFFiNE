import { createHmac, timingSafeEqual } from 'node:crypto';

import { Controller, Logger, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  BlobInvalid,
  CallMetric,
  Config,
  OnEvent,
  PROXY_MULTIPART_PATH,
  PROXY_UPLOAD_PATH,
  STORAGE_PROXY_ROOT,
  StorageProviderConfig,
  StorageProviderFactory,
} from '../../base';
import {
  R2StorageConfig,
  R2StorageProvider,
} from '../../base/storage/providers/r2';
import { Models } from '../../models';
import { Public } from '../auth/guard';
import { MULTIPART_PART_SIZE } from './constants';

type R2BlobStorageConfig = StorageProviderConfig & {
  provider: 'cloudflare-r2';
  config: R2StorageConfig;
};

type QueryValue = Request['query'][string];

type R2Config = {
  storage: R2BlobStorageConfig;
  signKey: string;
};

@Controller(STORAGE_PROXY_ROOT)
export class R2UploadController {
  private readonly logger = new Logger(R2UploadController.name);
  private provider: R2StorageProvider | null = null;

  constructor(
    private readonly config: Config,
    private readonly models: Models,
    private readonly storageFactory: StorageProviderFactory
  ) {}

  @OnEvent('config.changed')
  onConfigChanged(event: Events['config.changed']) {
    if (event.updates.storages?.blob?.storage) {
      this.provider = null;
    }
  }

  private getR2Config(): R2Config {
    const storage = this.config.storages.blob.storage as StorageProviderConfig;
    if (storage.provider !== 'cloudflare-r2') {
      throw new BlobInvalid('Invalid endpoint');
    }
    const r2Config = storage.config as R2StorageConfig;
    const signKey = r2Config.usePresignedURL?.signKey;
    if (
      !r2Config.usePresignedURL?.enabled ||
      !r2Config.usePresignedURL.urlPrefix ||
      !signKey
    ) {
      throw new BlobInvalid('Invalid endpoint');
    }
    return { storage: storage as R2BlobStorageConfig, signKey };
  }

  private getProvider(storage: R2BlobStorageConfig) {
    if (!this.provider) {
      const candidate = this.storageFactory.create(storage);
      if (candidate instanceof R2StorageProvider) {
        this.provider = candidate;
      }
    }
    return this.provider;
  }

  private sign(canonical: string, signKey: string) {
    return createHmac('sha256', signKey).update(canonical).digest('base64');
  }

  private safeEqual(expected: string, actual: string) {
    const a = Buffer.from(expected);
    const b = Buffer.from(actual);

    if (a.length !== b.length) {
      return false;
    }

    return timingSafeEqual(a, b);
  }

  private verifyToken(
    path: string,
    canonicalFields: (string | number | undefined)[],
    exp: number,
    token: string,
    signKey: string
  ) {
    const canonical = [
      path,
      ...canonicalFields.map(field =>
        field === undefined ? '' : field.toString()
      ),
      exp.toString(),
    ].join('\n');
    const expected = `${exp}-${this.sign(canonical, signKey)}`;

    return this.safeEqual(expected, token);
  }

  private expectString(value: QueryValue, field: string): string {
    if (Array.isArray(value)) {
      return String(value[0]);
    }
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    throw new BlobInvalid(`Missing ${field}.`);
  }

  private optionalString(value: QueryValue) {
    if (Array.isArray(value)) {
      return String(value[0]);
    }
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private number(value: QueryValue, field: string): number {
    const str = this.expectString(value, field);
    const num = Number(str);
    if (!Number.isFinite(num)) {
      throw new BlobInvalid(`Invalid ${field}.`);
    }
    return num;
  }

  private optionalNumber(value: QueryValue, field: string): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    const num = Number(Array.isArray(value) ? value[0] : value);
    if (!Number.isFinite(num)) {
      throw new BlobInvalid(`Invalid ${field}.`);
    }
    return num;
  }

  private parseContentLength(req: Request) {
    const raw = req.header('content-length');
    if (!raw) {
      return undefined;
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || num < 0) {
      throw new BlobInvalid('Invalid Content-Length header');
    }
    return num;
  }

  private ensureNotExpired(exp: number) {
    const now = Math.floor(Date.now() / 1000);
    if (exp < now) {
      throw new BlobInvalid('Upload URL expired');
    }
  }

  @Public()
  @Put('upload')
  @CallMetric('controllers', 'r2_proxy_upload')
  async upload(@Req() req: Request, @Res() res: Response) {
    const { storage, signKey } = this.getR2Config();

    const workspaceId = this.expectString(req.query.workspaceId, 'workspaceId');
    const key = this.expectString(req.query.key, 'key');
    const token = this.expectString(req.query.token, 'token');
    const exp = this.number(req.query.exp, 'exp');
    const contentType = this.optionalString(req.query.contentType);
    const contentLengthFromQuery = this.optionalNumber(
      req.query.contentLength,
      'contentLength'
    );

    this.ensureNotExpired(exp);

    if (
      !this.verifyToken(
        PROXY_UPLOAD_PATH,
        [workspaceId, key, contentType, contentLengthFromQuery],
        exp,
        token,
        signKey
      )
    ) {
      throw new BlobInvalid('Invalid upload token');
    }

    const record = await this.models.blob.get(workspaceId, key);
    if (!record) {
      throw new BlobInvalid('Blob upload is not initialized');
    }
    if (record.status === 'completed') {
      throw new BlobInvalid('Blob upload is already completed');
    }

    const contentLengthHeader = this.parseContentLength(req);
    if (
      contentLengthFromQuery !== undefined &&
      contentLengthHeader !== undefined &&
      contentLengthFromQuery !== contentLengthHeader
    ) {
      throw new BlobInvalid('Content length mismatch');
    }

    const contentLength = contentLengthHeader ?? contentLengthFromQuery;
    if (contentLength === undefined) {
      throw new BlobInvalid('Missing Content-Length header');
    }
    if (record.size && contentLength !== record.size) {
      throw new BlobInvalid('Content length does not match upload metadata');
    }

    const mime = contentType ?? record.mime;
    if (record.mime && mime && record.mime !== mime) {
      throw new BlobInvalid('Mime type mismatch');
    }

    const provider = this.getProvider(storage);
    if (!provider) {
      throw new BlobInvalid('R2 provider is not available');
    }

    try {
      await provider.proxyPutObject(`${workspaceId}/${key}`, req, {
        contentType: mime,
        contentLength,
      });
    } catch (error) {
      this.logger.error('Failed to proxy upload', error as Error);
      throw new BlobInvalid('Upload failed');
    }

    res.status(200).end();
  }

  @Public()
  @Put('multipart')
  @CallMetric('controllers', 'r2_proxy_multipart')
  async uploadPart(@Req() req: Request, @Res() res: Response) {
    const { storage, signKey } = this.getR2Config();

    const workspaceId = this.expectString(req.query.workspaceId, 'workspaceId');
    const key = this.expectString(req.query.key, 'key');
    const uploadId = this.expectString(req.query.uploadId, 'uploadId');
    const token = this.expectString(req.query.token, 'token');
    const exp = this.number(req.query.exp, 'exp');
    const partNumber = this.number(req.query.partNumber, 'partNumber');

    if (partNumber < 1) {
      throw new BlobInvalid('Invalid part number');
    }

    this.ensureNotExpired(exp);

    if (
      !this.verifyToken(
        PROXY_MULTIPART_PATH,
        [workspaceId, key, uploadId, partNumber],
        exp,
        token,
        signKey
      )
    ) {
      throw new BlobInvalid('Invalid upload token');
    }

    const record = await this.models.blob.get(workspaceId, key);
    if (!record) {
      throw new BlobInvalid('Multipart upload is not initialized');
    }
    if (record.status === 'completed') {
      throw new BlobInvalid('Blob upload is already completed');
    }
    if (record.uploadId !== uploadId) {
      throw new BlobInvalid('Upload id mismatch');
    }

    const contentLength = this.parseContentLength(req);
    if (contentLength === undefined || contentLength === 0) {
      throw new BlobInvalid('Missing Content-Length header');
    }

    const maxPartNumber = Math.ceil(record.size / MULTIPART_PART_SIZE);
    if (partNumber > maxPartNumber) {
      throw new BlobInvalid('Part number exceeds upload size');
    }
    if (
      record.size &&
      (partNumber - 1) * MULTIPART_PART_SIZE + contentLength > record.size
    ) {
      throw new BlobInvalid('Part size exceeds upload metadata');
    }

    const provider = this.getProvider(storage);
    if (!provider) {
      throw new BlobInvalid('R2 provider is not available');
    }

    try {
      const etag = await provider.proxyUploadPart(
        `${workspaceId}/${key}`,
        uploadId,
        partNumber,
        req,
        { contentLength }
      );
      if (etag) {
        res.setHeader('etag', etag);
      }
    } catch (error) {
      this.logger.error('Failed to proxy multipart upload', error as Error);
      throw new BlobInvalid('Upload failed');
    }

    res.status(200).end();
  }
}
