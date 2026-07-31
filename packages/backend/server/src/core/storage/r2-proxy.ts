import { timingSafeEqual } from 'node:crypto';

import { Controller, Logger, Put, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  BlobInvalid,
  CallMetric,
  Config,
  createStorageUploadToken,
  PROXY_MULTIPART_PATH,
  PROXY_UPLOAD_PATH,
  type S3StorageConfig,
  STORAGE_PROXY_ROOT,
  type StorageProviderConfig,
  toBuffer,
} from '../../base';
import { Models } from '../../models';
import { Public } from '../auth/guard';
import { StorageRuntimeProvider } from '../storage-runtime';
import { MULTIPART_PART_SIZE } from './constants';

type QueryValue = Request['query'][string];

type UploadProxyConfig = {
  signKey: string;
};

@Controller(STORAGE_PROXY_ROOT)
export class R2UploadController {
  private readonly logger = new Logger(R2UploadController.name);

  constructor(
    private readonly config: Config,
    private readonly models: Models,
    private readonly rt: StorageRuntimeProvider
  ) {}

  private getUploadProxyConfig(): UploadProxyConfig {
    const storage = this.config.storages.blob.storage as StorageProviderConfig;
    if (storage.provider !== 'cloudflare-r2' && storage.provider !== 'aws-s3') {
      throw new BlobInvalid('Invalid endpoint');
    }
    const uploadConfig = (storage.config as S3StorageConfig).usePresignedURL;
    const signKey = uploadConfig?.signKey;
    if (!uploadConfig?.enabled || !signKey) {
      throw new BlobInvalid('Invalid endpoint');
    }
    return { signKey };
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
    canonicalFields: (string | number)[],
    expiresAt: number,
    token: string,
    signKey: string
  ) {
    const expected = createStorageUploadToken(
      path,
      canonicalFields,
      expiresAt,
      signKey
    );

    return this.safeEqual(expected, token);
  }

  private expectString(value: QueryValue, field: string): string {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    throw new BlobInvalid(`Missing ${field}.`);
  }

  private number(value: QueryValue, field: string): number {
    const str = this.expectString(value, field);
    const num = Number(str);
    if (!Number.isSafeInteger(num)) {
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
    if (!Number.isSafeInteger(num) || num < 0) {
      throw new BlobInvalid('Invalid Content-Length header');
    }
    return num;
  }

  private ensureNotExpired(expiresAt: number) {
    const now = Math.floor(Date.now() / 1000);
    if (expiresAt < now) {
      throw new BlobInvalid('Upload URL expired');
    }
  }

  @Public()
  @Put('upload')
  @CallMetric('controllers', 'r2_proxy_upload')
  async upload(@Req() req: Request, @Res() res: Response) {
    const { signKey } = this.getUploadProxyConfig();

    const workspaceId = this.expectString(req.query.workspaceId, 'workspaceId');
    const key = this.expectString(req.query.key, 'key');
    const token = this.expectString(req.query.token, 'token');
    const expiresAt = this.number(req.query.expiresAt, 'expiresAt');
    const contentType = this.expectString(req.query.contentType, 'contentType');
    const contentLengthFromQuery = this.number(
      req.query.contentLength,
      'contentLength'
    );
    if (
      !Number.isInteger(contentLengthFromQuery) ||
      contentLengthFromQuery < 0
    ) {
      throw new BlobInvalid('Invalid content length');
    }

    this.ensureNotExpired(expiresAt);

    if (
      !this.verifyToken(
        PROXY_UPLOAD_PATH,
        [workspaceId, key, contentType, contentLengthFromQuery],
        expiresAt,
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
      contentLengthHeader !== undefined &&
      contentLengthFromQuery !== contentLengthHeader
    ) {
      throw new BlobInvalid('Content length mismatch');
    }

    const contentLength = contentLengthHeader ?? contentLengthFromQuery;
    if (record.size && contentLength !== record.size) {
      throw new BlobInvalid('Content length does not match upload metadata');
    }

    if (record.mime && contentType && record.mime !== contentType) {
      throw new BlobInvalid('Mime type mismatch');
    }

    try {
      await this.rt.putObject(
        'blob',
        `${workspaceId}/${key}`,
        await toBuffer(req),
        { contentType, contentLength }
      );
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
    const { signKey } = this.getUploadProxyConfig();

    const workspaceId = this.expectString(req.query.workspaceId, 'workspaceId');
    const key = this.expectString(req.query.key, 'key');
    const uploadId = this.expectString(req.query.uploadId, 'uploadId');
    const token = this.expectString(req.query.token, 'token');
    const expiresAt = this.number(req.query.expiresAt, 'expiresAt');
    const partNumber = this.number(req.query.partNumber, 'partNumber');
    const contentLengthFromQuery = this.number(
      req.query.contentLength,
      'contentLength'
    );

    if (partNumber < 1) {
      throw new BlobInvalid('Invalid part number');
    }
    if (
      !Number.isInteger(contentLengthFromQuery) ||
      contentLengthFromQuery < 1
    ) {
      throw new BlobInvalid('Invalid content length');
    }

    this.ensureNotExpired(expiresAt);

    if (
      !this.verifyToken(
        PROXY_MULTIPART_PATH,
        [workspaceId, key, uploadId, partNumber, contentLengthFromQuery],
        expiresAt,
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
    if (contentLength !== contentLengthFromQuery) {
      throw new BlobInvalid('Content length mismatch');
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

    try {
      const etag = await this.rt.proxyUploadPart(
        'blob',
        `${workspaceId}/${key}`,
        uploadId,
        partNumber,
        await toBuffer(req),
        contentLength
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
