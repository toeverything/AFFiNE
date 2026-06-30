import { JSONSchema } from '../../config';

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
}

export const R2_JURISDICTIONS = ['default', 'eu'] as const;

export interface R2StorageConfig extends Omit<S3StorageConfig, 'endpoint'> {
  accountId: string;
  jurisdiction?: (typeof R2_JURISDICTIONS)[number];
  usePresignedURL?: {
    enabled: boolean;
    urlPrefix?: string;
    signKey?: string;
  };
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

const S3ConfigSchema: JSONSchema = {
  type: 'object',
  description: 'The config for the S3 compatible storage provider.',
  properties: {
    endpoint: {
      type: 'string',
      description:
        'The S3 compatible endpoint (used by aws-s3 provider). Optional; if omitted, endpoint is derived from region.',
    },
    region: {
      type: 'string',
      description:
        'The region for the storage provider. Example: "us-east-1" or "auto" for R2.',
    },
    forcePathStyle: {
      type: 'boolean',
      description: 'Whether to use path-style bucket addressing.',
    },
    requestTimeoutMs: {
      type: 'number',
      description: 'Request timeout in milliseconds.',
    },
    minPartSize: {
      type: 'number',
      description: 'Minimum multipart part size in bytes.',
    },
    presign: {
      type: 'object',
      description: 'Presigned URL behavior configuration.',
      properties: {
        expiresInSeconds: {
          type: 'number',
          description: 'Expiration time in seconds for presigned URLs.',
        },
        signContentTypeForPut: {
          type: 'boolean',
          description: 'Whether to sign Content-Type for presigned PUT.',
        },
      },
    },
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
        sessionToken: {
          type: 'string',
        },
      },
    },
  },
};

const S3ConfigPropertiesWithoutEndpoint = Object.fromEntries(
  Object.entries(
    (
      S3ConfigSchema as {
        type: 'object';
        properties?: Record<string, JSONSchema>;
      }
    ).properties ?? {}
  ).filter(([key]) => key !== 'endpoint')
) as Record<string, JSONSchema>;

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
            ...S3ConfigPropertiesWithoutEndpoint,
            accountId: {
              type: 'string' as const,
              description:
                'The account id for the cloudflare r2 storage provider.',
            },
            jurisdiction: {
              type: 'string' as const,
              enum: [...R2_JURISDICTIONS],
              description:
                'Optional jurisdiction for the cloudflare r2 endpoint. Set to "eu" for EU buckets.',
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
    {
      type: 'object',
      properties: {
        provider: {
          type: 'string',
          enum: ['assetpack'],
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
          required: ['path'],
        },
      },
      required: ['provider', 'bucket', 'config'],
    },
  ],
};

export type * from '../types';
export {
  applyAttachHeaders,
  PROXY_MULTIPART_PATH,
  PROXY_UPLOAD_PATH,
  sniffMime,
  STORAGE_PROXY_ROOT,
  toBuffer,
} from '../utils';
