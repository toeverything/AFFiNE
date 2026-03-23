import type { Buffer } from 'node:buffer';
import { stringify as stringifyQuery } from 'node:querystring';
import type { Readable } from 'node:stream';

import aws4 from 'aws4';
import { XMLParser } from 'fast-xml-parser';
import { S3mini, sanitizeETag } from 's3mini';

export type S3CompatCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

export type S3CompatConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  forcePathStyle?: boolean;
  requestTimeoutMs?: number;
  minPartSize?: number;
  presign?: {
    expiresInSeconds: number;
    signContentTypeForPut?: boolean;
  };
};

export type PresignedResult = {
  url: string;
  headers?: Record<string, string>;
  expiresAt: Date;
};

export type ListPartItem = { partNumber: number; etag: string };

export type ListObjectsItem = {
  key: string;
  lastModified: Date;
  contentLength: number;
};

export interface S3CompatClient {
  putObject(
    key: string,
    body: Blob | Buffer | Uint8Array | ReadableStream | Readable,
    meta?: { contentType?: string; contentLength?: number }
  ): Promise<void>;
  getObjectResponse(key: string): Promise<Response | null>;
  headObject(key: string): Promise<
    | {
        contentType?: string;
        contentLength?: number;
        lastModified?: Date;
        checksumCRC32?: string;
      }
    | undefined
  >;
  deleteObject(key: string): Promise<void>;
  listObjectsV2(prefix?: string): Promise<ListObjectsItem[]>;

  createMultipartUpload(
    key: string,
    meta?: { contentType?: string }
  ): Promise<{ uploadId: string }>;
  uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Blob | Buffer | Uint8Array | ReadableStream | Readable,
    meta?: { contentLength?: number }
  ): Promise<{ etag: string }>;
  listParts(key: string, uploadId: string): Promise<ListPartItem[] | undefined>;
  completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: ListPartItem[]
  ): Promise<void>;
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;

  presignGetObject(key: string): Promise<PresignedResult>;
  presignPutObject(
    key: string,
    meta?: { contentType?: string }
  ): Promise<PresignedResult>;
  presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number
  ): Promise<PresignedResult>;
}

export type ParsedListParts = {
  parts: ListPartItem[];
  isTruncated: boolean;
  nextPartNumberMarker?: string;
};

const listPartsParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return false;
}

function joinPath(basePath: string, suffix: string) {
  const trimmedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  const trimmedSuffix = suffix.startsWith('/') ? suffix.slice(1) : suffix;
  if (!trimmedBase) {
    return `/${trimmedSuffix}`;
  }
  if (!trimmedSuffix) {
    return trimmedBase;
  }
  return `${trimmedBase}/${trimmedSuffix}`;
}

function encodeKey(key: string) {
  return key.split('/').map(encodeURIComponent).join('/');
}

function buildQuery(params: Record<string, string | number | undefined>) {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined
  );
  if (entries.length === 0) return '';
  return stringifyQuery(
    Object.fromEntries(entries.map(([key, value]) => [key, String(value)]))
  );
}

function detectErrorCode(xml: string): string | undefined {
  const parsed = listPartsParser.parse(xml);
  if (!parsed || typeof parsed !== 'object') return undefined;
  const error = (parsed as any).Error;
  if (!error || typeof error !== 'object') return undefined;
  const code = error.Code;
  return typeof code === 'string' ? code : undefined;
}

export function parseListPartsXml(xml: string): ParsedListParts {
  const parsed = listPartsParser.parse(xml);
  const root =
    parsed?.ListPartsResult ??
    parsed?.ListPartsResult?.ListPartsResult ??
    parsed?.ListPartsResult;
  const result = root && typeof root === 'object' ? root : parsed;
  const partsNode = result?.Part;

  const parts = asArray(partsNode)
    .map((part: any) => {
      const partNumber = Number(part?.PartNumber);
      const etag =
        typeof part?.ETag === 'string' ? sanitizeETag(part.ETag) : '';
      if (!partNumber || !etag) return undefined;
      return { partNumber, etag } satisfies ListPartItem;
    })
    .filter((part): part is ListPartItem => !!part);

  const isTruncated = toBoolean(result?.IsTruncated);
  const nextPartNumberMarker =
    typeof result?.NextPartNumberMarker === 'string'
      ? result?.NextPartNumberMarker
      : result?.NextPartNumberMarker !== undefined
        ? String(result?.NextPartNumberMarker)
        : undefined;

  return { parts, isTruncated, nextPartNumberMarker };
}

function buildEndpoint(config: S3CompatConfig) {
  const url = new URL(config.endpoint);
  if (config.forcePathStyle) {
    const firstSegment = url.pathname.split('/').find(Boolean);
    if (firstSegment !== config.bucket) {
      url.pathname = joinPath(url.pathname, config.bucket);
    }
    return url;
  }

  const firstSegment = url.pathname.split('/').find(Boolean);
  const hostHasBucket = url.hostname.startsWith(`${config.bucket}.`);
  const pathHasBucket = firstSegment === config.bucket;
  if (!hostHasBucket && !pathHasBucket) {
    url.hostname = `${config.bucket}.${url.hostname}`;
  }
  return url;
}

function shouldUseDuplex(init: RequestInit | undefined) {
  if (!init?.body) return false;
  if (typeof init.body === 'string') return false;
  if (init.body instanceof ArrayBuffer) return false;
  if (init.body instanceof Uint8Array) return false;
  if (typeof Blob !== 'undefined' && init.body instanceof Blob) return false;
  return true;
}

export class S3Compat implements S3CompatClient {
  private readonly client: S3mini;
  private readonly endpoint: URL;
  private readonly basePath: string;
  private readonly region: string;
  private readonly credentials: S3CompatCredentials;
  private readonly presignConfig: {
    expiresInSeconds: number;
    signContentTypeForPut: boolean;
  };
  private readonly fetchImpl: typeof fetch;

  constructor(config: S3CompatConfig, credentials: S3CompatCredentials) {
    this.endpoint = buildEndpoint(config);
    this.basePath =
      this.endpoint.pathname === '/' ? '' : this.endpoint.pathname;
    this.region = config.region;
    this.credentials = credentials;
    this.presignConfig = {
      expiresInSeconds: config.presign?.expiresInSeconds ?? 60 * 60,
      signContentTypeForPut: config.presign?.signContentTypeForPut ?? true,
    };

    const fetchImpl = globalThis.fetch.bind(globalThis);
    this.fetchImpl = (input, init) => {
      if (shouldUseDuplex(init)) {
        return fetchImpl(input, { ...init, duplex: 'half' } as RequestInit);
      }
      return fetchImpl(input, init);
    };

    this.client = new S3mini({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      endpoint: this.endpoint.toString(),
      region: config.region,
      requestAbortTimeout: config.requestTimeoutMs,
      minPartSize: config.minPartSize,
      fetch: this.fetchImpl,
    });
  }

  static fromConfig(config: S3CompatConfig, credentials: S3CompatCredentials) {
    return new S3Compat(config, credentials);
  }

  private buildObjectPath(key: string) {
    const encodedKey = encodeKey(key);
    return joinPath(this.basePath, encodedKey);
  }

  private async signedFetch(
    method: string,
    key: string,
    query?: Record<string, string | number | undefined>,
    headers?: Record<string, string>
  ) {
    const path = this.buildObjectPath(key);
    const queryString = query ? buildQuery(query) : '';
    const requestPath = queryString ? `${path}?${queryString}` : path;
    const signed = aws4.sign(
      {
        method,
        service: 's3',
        region: this.region,
        host: this.endpoint.host,
        path: requestPath,
        headers: headers ?? {},
      },
      this.credentials
    );

    const signedHeaders = Object.fromEntries(
      Object.entries(signed.headers ?? {}).map(([key, value]) => [
        key,
        String(value),
      ])
    );

    const url = `${this.endpoint.origin}${signed.path}`;
    return this.fetchImpl(url, { method, headers: signedHeaders });
  }

  private presign(
    method: string,
    key: string,
    query?: Record<string, string | number | undefined>,
    headers?: Record<string, string>
  ): PresignedResult {
    const expiresInSeconds = this.presignConfig.expiresInSeconds;
    const path = this.buildObjectPath(key);
    const queryString = buildQuery({
      ...query,
      'X-Amz-Expires': expiresInSeconds,
    });
    const requestPath = queryString ? `${path}?${queryString}` : path;
    const signed = aws4.sign(
      {
        method,
        service: 's3',
        region: this.region,
        host: this.endpoint.host,
        path: requestPath,
        headers: headers ?? {},
        signQuery: true,
      },
      this.credentials
    );

    return {
      url: `${this.endpoint.origin}${signed.path}`,
      headers,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async putObject(
    key: string,
    body: Blob | Buffer | Uint8Array | ReadableStream | Readable,
    meta?: { contentType?: string; contentLength?: number }
  ): Promise<void> {
    const res = await this.client.putObject(
      key,
      body as any,
      meta?.contentType,
      undefined,
      undefined,
      meta?.contentLength
    );
    if (!res.ok) {
      throw new Error(`Failed to put object: ${res.status}`);
    }
  }

  async getObjectResponse(key: string) {
    return this.client.getObjectResponse(key);
  }

  async headObject(key: string) {
    const res = await this.signedFetch('HEAD', key);
    if (res.status === 404) {
      return undefined;
    }

    if (!res.ok) {
      const errorBody = await res.text();
      const errorCode = detectErrorCode(errorBody);
      if (errorCode === 'NoSuchKey' || errorCode === 'NotFound') {
        return undefined;
      }
      throw new Error(`Failed to head object: ${res.status}`);
    }

    const contentLengthHeader = res.headers.get('content-length');
    const contentLength = contentLengthHeader
      ? Number(contentLengthHeader)
      : undefined;
    const contentType = res.headers.get('content-type') ?? undefined;
    const lastModifiedHeader = res.headers.get('last-modified');
    const lastModified = lastModifiedHeader
      ? new Date(lastModifiedHeader)
      : undefined;
    const checksumCRC32 = res.headers.get('x-amz-checksum-crc32') ?? undefined;

    return {
      contentType,
      contentLength,
      lastModified,
      checksumCRC32,
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.deleteObject(key);
  }

  async listObjectsV2(prefix?: string): Promise<ListObjectsItem[]> {
    const results: ListObjectsItem[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.listObjectsPaged(
        '/',
        prefix ?? '',
        1000,
        continuationToken
      );
      if (!page || !page.objects) {
        break;
      }
      for (const item of page.objects) {
        results.push({
          key: item.Key,
          lastModified: item.LastModified,
          contentLength: item.Size,
        });
      }
      continuationToken = page.nextContinuationToken;
    } while (continuationToken);

    return results;
  }

  async createMultipartUpload(
    key: string,
    meta?: { contentType?: string }
  ): Promise<{ uploadId: string }> {
    const uploadId = await this.client.getMultipartUploadId(
      key,
      meta?.contentType
    );
    return { uploadId };
  }

  async uploadPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: Blob | Buffer | Uint8Array | ReadableStream | Readable,
    meta?: { contentLength?: number }
  ): Promise<{ etag: string }> {
    const additionalHeaders = meta?.contentLength
      ? { 'Content-Length': String(meta.contentLength) }
      : undefined;
    const part = await this.client.uploadPart(
      key,
      uploadId,
      body as any,
      partNumber,
      {},
      undefined,
      additionalHeaders
    );
    return { etag: part.etag };
  }

  async listParts(
    key: string,
    uploadId: string
  ): Promise<ListPartItem[] | undefined> {
    const parts: ListPartItem[] = [];
    let partNumberMarker: string | undefined;

    while (true) {
      const res = await this.signedFetch('GET', key, {
        uploadId,
        'part-number-marker': partNumberMarker,
      });

      if (res.status === 404) {
        return undefined;
      }

      const body = await res.text();
      if (!res.ok) {
        const errorCode = detectErrorCode(body);
        if (errorCode === 'NoSuchUpload' || errorCode === 'NotFound') {
          return undefined;
        }
        throw new Error(`Failed to list multipart upload parts: ${res.status}`);
      }

      const parsed = parseListPartsXml(body);
      parts.push(...parsed.parts);

      if (!parsed.isTruncated || !parsed.nextPartNumberMarker) {
        break;
      }

      partNumberMarker = parsed.nextPartNumberMarker;
    }

    return parts;
  }

  async completeMultipartUpload(
    key: string,
    uploadId: string,
    parts: ListPartItem[]
  ): Promise<void> {
    await this.client.completeMultipartUpload(key, uploadId, parts);
  }

  async abortMultipartUpload(key: string, uploadId: string): Promise<void> {
    await this.client.abortMultipartUpload(key, uploadId);
  }

  async presignGetObject(key: string): Promise<PresignedResult> {
    return this.presign('GET', key);
  }

  async presignPutObject(
    key: string,
    meta?: { contentType?: string }
  ): Promise<PresignedResult> {
    const contentType = meta?.contentType ?? 'application/octet-stream';
    const signContentType = this.presignConfig.signContentTypeForPut ?? true;
    const headers = signContentType
      ? { 'Content-Type': contentType }
      : undefined;
    const result = this.presign('PUT', key, undefined, headers);

    return {
      ...result,
      headers: headers ? { 'Content-Type': contentType } : undefined,
    };
  }

  async presignUploadPart(
    key: string,
    uploadId: string,
    partNumber: number
  ): Promise<PresignedResult> {
    return this.presign('PUT', key, { uploadId, partNumber });
  }
}

export function createS3CompatClient(
  config: S3CompatConfig,
  credentials: S3CompatCredentials
) {
  return new S3Compat(config, credentials);
}
