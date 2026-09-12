import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const csv = z
  .string()
  .optional()
  .transform(value =>
    (value ?? '')
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0)
  );

const boolish = z
  .string()
  .optional()
  .transform(value => {
    if (value === undefined || value === '') {
      return undefined;
    }
    return value !== 'false' && value !== '0';
  });

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3010),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  MOSAIC_PUBLIC_URL: z.string().url().default('http://localhost:3010'),
  MOSAIC_SERVER_NAME: z.string().min(1).default('Mosaic'),
  MOSAIC_SERVER_VERSION: z.string().min(1).default('0.1.0'),
  MOSAIC_COMPAT_VERSION: z.string().min(1).default('0.27.5'),
  MOSAIC_FEATURES: csv,
  // Cutover: client images bake MOSAIC_SERVER=1 → BUILD_CONFIG.isMosaicServer.
  // On this process the same env adds `mosaic` to GET /info features.
  MOSAIC_SERVER: boolish,
  MOSAIC_STATIC_DIR: z
    .string()
    .optional()
    .transform(value => {
      if (value === undefined || value.trim() === '') {
        return undefined;
      }
      return value;
    }),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  MOSAIC_PERSISTENCE: z.enum(['memory', 'postgres']).optional(),
  MOSAIC_ALLOW_SIGNUP: boolish,
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(1).default(8),
  PASSWORD_MAX_LENGTH: z.coerce.number().int().min(8).default(128),
  SESSION_IDLE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60 * 1000),
  SESSION_ABSOLUTE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 24 * 60 * 60 * 1000),
  ACCESS_TOKEN_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  REFRESH_TOKEN_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 24 * 60 * 60 * 1000),
  COOKIE_SECURE: boolish,
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(20),
  SYNC_COMPACT_UPDATES: z.coerce.number().int().min(1).default(64),
  SYNC_MAX_UPDATE_BYTES: z.coerce.number().int().min(1024).default(1_048_576),
  BLOB_DRIVER: z.enum(['memory', 'fs']).optional(),
  BLOB_DIR: z.string().min(1).default('data/blobs'),
  BLOB_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(100 * 1024 * 1024),
  BLOB_STORAGE_QUOTA_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .default(100 * 1024 * 1024 * 1024),
  BLOB_MULTIPART_THRESHOLD: z.coerce
    .number()
    .int()
    .min(1024)
    .default(8 * 1024 * 1024),
  BLOB_PART_SIZE: z.coerce
    .number()
    .int()
    .min(1024)
    .default(5 * 1024 * 1024),
  BLOB_UPLOAD_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 1000),
  DOC_HISTORY_LIMIT: z.coerce.number().int().min(1).default(50),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().min(1).default('mosaic-server'),
  MOSAIC_OIDC_ISSUER: z.string().optional(),
  MOSAIC_OIDC_CLIENT_ID: z.string().optional(),
  MOSAIC_OIDC_CLIENT_SECRET: z.string().optional(),
  MOSAIC_OIDC_PROVIDER: z
    .enum(['OIDC', 'Google', 'GitHub', 'Apple'])
    .optional(),
  MOSAIC_SAML_IDP_SSO_URL: z.string().optional(),
  MOSAIC_SAML_IDP_ENTITY_ID: z.string().optional(),
  MOSAIC_SAML_CERTIFICATE: z.string().optional(),
  MOSAIC_AI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  MOSAIC_AI_API_KEY: z.string().optional(),
  MOSAIC_AI_MODEL: z.string().min(1).default('gpt-4o-mini'),
  MOSAIC_SIEM_WEBHOOK_URL: z.string().optional(),
  MOSAIC_JIRA_BASE_URL: z.string().optional(),
  MOSAIC_JIRA_EMAIL: z.string().optional(),
  MOSAIC_JIRA_API_TOKEN: z.string().optional(),
  MOSAIC_JIRA_WEBHOOK_SECRET: z.string().optional(),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(0).default(365),
});

export type AppConfig = z.infer<typeof EnvSchema> & {
  flavor: 'allinone';
  deploymentType: 'selfhosted';
  allowSignup: boolean;
  cookieSecure: boolean;
};

function parseDotEnv(raw: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function loadDotEnv(cwd = process.cwd()): void {
  const file = resolve(cwd, '.env');
  if (!existsSync(file)) {
    return;
  }
  const fromFile = parseDotEnv(readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(fromFile)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const production = parsed.NODE_ENV === 'production';
  const features = [...parsed.MOSAIC_FEATURES];
  if (parsed.MOSAIC_SERVER === true && !features.includes('mosaic')) {
    features.unshift('mosaic');
  }
  return {
    ...parsed,
    MOSAIC_FEATURES: features,
    flavor: 'allinone',
    deploymentType: 'selfhosted',
    allowSignup: parsed.MOSAIC_ALLOW_SIGNUP ?? true,
    cookieSecure: parsed.COOKIE_SECURE ?? production,
  };
}

export function hasFeature(config: AppConfig, flag: string): boolean {
  return config.MOSAIC_FEATURES.includes(flag);
}
