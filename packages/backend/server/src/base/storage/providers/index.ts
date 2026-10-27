export type StorageProviderName =
  | 'fs'
  | 'aws-s3'
  | 'cloudflare-r2'
  | 'assetpack';

export interface FsStorageConfig {
  path: string;
}

export type AssetpackStorageConfig = FsStorageConfig;

export interface S3StorageConfig {
  endpoint?: string;
  region: string;
  credentials?: {
    accessKeyId?: string;
    secretAccessKey?: string;
    sessionToken?: string;
  };
  forcePathStyle?: boolean;
  requestTimeoutMs?: number;
  minPartSize?: number;
  presign?: {
    expiresInSeconds?: number;
    signContentTypeForPut?: boolean;
  };
  usePresignedURL?: {
    enabled: boolean;
    urlPrefix?: string;
    signKey?: string;
  };
}

export const R2_JURISDICTIONS = ['default', 'eu'] as const;

export interface R2StorageConfig extends Omit<S3StorageConfig, 'endpoint'> {
  accountId: string;
  jurisdiction?: (typeof R2_JURISDICTIONS)[number];
}

export type StorageProviderConfig = { bucket: string } & (
  | {
      provider: 'fs';
      config: FsStorageConfig;
    }
  | {
      provider: 'aws-s3';
      config: S3StorageConfig;
    }
  | {
      provider: 'cloudflare-r2';
      config: R2StorageConfig;
    }
  | {
      provider: 'assetpack';
      config: AssetpackStorageConfig;
    }
);

export type * from '../types';
export {
  applyAttachHeaders,
  PROXY_MULTIPART_PATH,
  PROXY_UPLOAD_PATH,
  sniffMime,
  STORAGE_PROXY_ROOT,
  toBuffer,
} from '../utils';
