import { Type } from '@nestjs/common';

import { JSONSchema } from '../../config';
import { FsStorageConfig, FsStorageProvider } from './fs';
import { StorageProvider } from './provider';
import { R2StorageConfig, R2StorageProvider } from './r2';
import { S3StorageConfig, S3StorageProvider } from './s3';

export type StorageProviderName = 'fs' | 'aws-s3' | 'cloudflare-r2';
export const StorageProviders: Record<
  StorageProviderName,
  Type<StorageProvider>
> = {
  fs: FsStorageProvider,
  'aws-s3': S3StorageProvider,
  'cloudflare-r2': R2StorageProvider,
};

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
);

const S3ConfigSchema: JSONSchema = {
  type: 'object',
  description:
    'The config for the s3 compatible storage provider. directly passed to aws-sdk client.\n@link https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html',
  properties: {
    credentials: {
      type: 'object',
      description: 'The credentials for the s3 compatible storage provider.',
      properties: {
        accessKeyId: {
          type: 'string',
        },
        secretAccessKey: {
          type: 'string',
        },
      },
    },
  },
};

export const StorageJSONSchema: JSONSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['fs'],
        },
        bucket: {
          type: 'string',
        },
        config: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
            },
          },
        },
      },
    },
    {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['aws-s3'],
        },
        bucket: {
          type: 'string',
        },
        config: S3ConfigSchema,
      },
    },
    {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['cloudflare-r2'],
        },
        bucket: {
          type: 'string',
        },
        config: {
          ...S3ConfigSchema,
          properties: {
            ...S3ConfigSchema.properties,
            accountId: {
              type: 'string' as const,
              description:
                'The account id for the cloudflare r2 storage provider.',
            },
            usePresignedURL: {
              type: 'object' as const,
              description:
                'The presigned url config for the cloudflare r2 storage provider.',
              properties: {
                enabled: {
                  type: 'boolean' as const,
                  description:
                    'Whether to use presigned url for the cloudflare r2 storage provider.',
                },
                urlPrefix: {
                  type: 'string' as const,
                  description:
                    'The custom domain URL prefix for the cloudflare r2 storage provider.\nWhen `enabled=true` and `urlPrefix` + `signKey` are provided, the server will:\n- Redirect GET requests to this custom domain with an HMAC token.\n- Return upload URLs under `/api/storage/*` for uploads.\nPresigned/upload proxy TTL is 1 hour.\nsee https://developers.cloudflare.com/waf/custom-rules/use-cases/configure-token-authentication/ to configure it.\nExample value: "https://storage.example.com"\nExample rule: is_timed_hmac_valid_v0("your_secret", http.request.uri, 10800, http.request.timestamp.sec, 6)',
                },
                signKey: {
                  type: 'string' as const,
                  description:
                    'The presigned key for the cloudflare r2 storage provider.',
                },
              },
            },
          },
        },
      },
    },
  ],
};

export type * from './provider';
export {
  applyAttachHeaders,
  autoMetadata,
  PROXY_MULTIPART_PATH,
  PROXY_UPLOAD_PATH,
  sniffMime,
  STORAGE_PROXY_ROOT,
  toBuffer,
} from './utils';
