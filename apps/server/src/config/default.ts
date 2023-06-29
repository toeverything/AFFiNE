/// <reference types="../global.d.ts" />

import { createPrivateKey, createPublicKey } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

import parse from 'parse-duration';

import pkg from '../../package.json' assert { type: 'json' };
import type { AFFiNEConfig } from './def';
import { applyEnvToConfig } from './env';

// Don't use this in production
export const examplePrivateKey = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIEtyAJLIULkphVhqXqxk4Nr8Ggty3XLwUJWBxzAWCWTMoAoGCCqGSM49
AwEHoUQDQgAEF3U/0wIeJ3jRKXeFKqQyBKlr9F7xaAUScRrAuSP33rajm3cdfihI
3JvMxVNsS2lE8PSGQrvDrJZaDo0L+Lq9Gg==
-----END EC PRIVATE KEY-----`;

const jwtKeyPair = (function () {
  const AUTH_PRIVATE_KEY = process.env.AUTH_PRIVATE_KEY ?? examplePrivateKey;
  const privateKey = createPrivateKey({
    key: Buffer.from(AUTH_PRIVATE_KEY),
    format: 'pem',
    type: 'sec1',
  })
    .export({
      format: 'pem',
      type: 'pkcs8',
    })
    .toString('utf8');
  const publicKey = createPublicKey({
    key: Buffer.from(AUTH_PRIVATE_KEY),
    format: 'pem',
    type: 'spki',
  })
    .export({
      format: 'pem',
      type: 'spki',
    })
    .toString('utf8');

  return {
    publicKey,
    privateKey,
  };
})();

export const getDefaultAFFiNEConfig: () => AFFiNEConfig = () => {
  const defaultConfig = {
    serverId: 'affine-nestjs-server',
    version: pkg.version,
    ENV_MAP: {
      AFFINE_SERVER_PORT: 'port',
      AFFINE_SERVER_HOST: 'host',
      AFFINE_SERVER_SUB_PATH: 'path',
      DATABASE_URL: 'db.url',
      AUTH_PRIVATE_KEY: 'auth.privateKey',
      ENABLE_R2_OBJECT_STORAGE: 'objectStorage.r2.enabled',
      R2_OBJECT_STORAGE_ACCOUNT_ID: 'objectStorage.r2.accountId',
      R2_OBJECT_STORAGE_ACCESS_KEY_ID: 'objectStorage.r2.accessKeyId',
      R2_OBJECT_STORAGE_SECRET_ACCESS_KEY: 'objectStorage.r2.secretAccessKey',
      R2_OBJECT_STORAGE_BUCKET: 'objectStorage.r2.bucket',
      OAUTH_GOOGLE_CLIENT_ID: 'auth.oauthProviders.google.clientId',
      OAUTH_GOOGLE_CLIENT_SECRET: 'auth.oauthProviders.google.clientSecret',
      OAUTH_GITHUB_CLIENT_ID: 'auth.oauthProviders.github.clientId',
      OAUTH_GITHUB_CLIENT_SECRET: 'auth.oauthProviders.github.clientSecret',
    } satisfies AFFiNEConfig['ENV_MAP'],
    env: process.env.NODE_ENV ?? 'development',
    get prod() {
      return this.env === 'production';
    },
    get dev() {
      return this.env === 'development';
    },
    get test() {
      return this.env === 'test';
    },
    get deploy() {
      return !this.dev && !this.test;
    },
    https: false,
    host: 'localhost',
    port: 3010,
    path: '',
    db: {
      url: '',
    },
    get origin() {
      return this.dev
        ? 'http://localhost:8080'
        : `${this.https ? 'https' : 'http'}://${this.host}${
            this.host === 'localhost' ? `:${this.port}` : ''
          }`;
    },
    get baseUrl() {
      return `${this.origin}${this.path}`;
    },
    graphql: {
      buildSchemaOptions: {
        numberScalarMode: 'integer',
      },
      introspection: true,
      playground: true,
      debug: true,
    },
    auth: {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      accessTokenExpiresIn: parse('1h')! / 1000,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      refreshTokenExpiresIn: parse('7d')! / 1000,
      leeway: 60,
      privateKey: jwtKeyPair.privateKey,
      publicKey: jwtKeyPair.publicKey,
      enableSignup: true,
      enableOauth: false,
      nextAuthSecret: '',
      oauthProviders: {},
    },
    objectStorage: {
      r2: {
        enabled: false,
        bucket: '',
        accountId: '',
        accessKeyId: '',
        secretAccessKey: '',
      },
      fs: {
        path: join(homedir(), '.affine-storage'),
      },
    },
  } as const;

  applyEnvToConfig(defaultConfig);

  return defaultConfig;
};
