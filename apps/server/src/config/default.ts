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
      AFFINE_SERVER_PORT: ['port', 'int'],
      AFFINE_SERVER_HOST: 'host',
      AFFINE_SERVER_SUB_PATH: 'path',
      AFFINE_ENV: 'affineEnv',
      DATABASE_URL: 'db.url',
      AUTH_PRIVATE_KEY: 'auth.privateKey',
      ENABLE_R2_OBJECT_STORAGE: ['objectStorage.r2.enabled', 'boolean'],
      R2_OBJECT_STORAGE_ACCOUNT_ID: 'objectStorage.r2.accountId',
      R2_OBJECT_STORAGE_ACCESS_KEY_ID: 'objectStorage.r2.accessKeyId',
      R2_OBJECT_STORAGE_SECRET_ACCESS_KEY: 'objectStorage.r2.secretAccessKey',
      R2_OBJECT_STORAGE_BUCKET: 'objectStorage.r2.bucket',
      OAUTH_GOOGLE_ENABLED: ['auth.oauthProviders.google.enabled', 'boolean'],
      OAUTH_GOOGLE_CLIENT_ID: 'auth.oauthProviders.google.clientId',
      OAUTH_GOOGLE_CLIENT_SECRET: 'auth.oauthProviders.google.clientSecret',
      OAUTH_GITHUB_ENABLED: ['auth.oauthProviders.github.enabled', 'boolean'],
      OAUTH_GITHUB_CLIENT_ID: 'auth.oauthProviders.github.clientId',
      OAUTH_GITHUB_CLIENT_SECRET: 'auth.oauthProviders.github.clientSecret',
      OAUTH_EMAIL_LOGIN: 'auth.email.login',
      OAUTH_EMAIL_SENDER: 'auth.email.sender',
      OAUTH_EMAIL_SERVER: 'auth.email.server',
      OAUTH_EMAIL_PORT: ['auth.email.port', 'int'],
      OAUTH_EMAIL_PASSWORD: 'auth.email.password',
      REDIS_SERVER_ENABLED: ['redis.enabled', 'boolean'],
      REDIS_SERVER_HOST: 'redis.host',
      REDIS_SERVER_PORT: ['redis.port', 'int'],
      REDIS_SERVER_USER: 'redis.username',
      REDIS_SERVER_PASSWORD: 'redis.password',
      REDIS_SERVER_DATABASE: ['redis.database', 'int'],
      DOC_MERGE_INTERVAL: ['doc.manager.updatePollInterval', 'int'],
      DOC_MERGE_USE_JWST_CODEC: [
        'doc.manager.experimentalMergeWithJwstCodec',
        'boolean',
      ],
    } satisfies AFFiNEConfig['ENV_MAP'],
    affineEnv: 'dev',
    get affine() {
      const env = this.affineEnv;
      return {
        canary: env === 'dev',
        beta: env === 'beta',
        stable: env === 'production',
      };
    },
    env: process.env.NODE_ENV ?? 'development',
    get node() {
      const env = this.env;
      return {
        prod: env === 'production',
        dev: env === 'development',
        test: env === 'test',
      };
    },
    get deploy() {
      return !this.node.dev && !this.node.test;
    },
    get featureFlags() {
      return {
        earlyAccessPreview:
          this.node.prod && (this.affine.beta || this.affine.canary),
      };
    },
    https: false,
    host: 'localhost',
    port: 3010,
    path: '',
    db: {
      url: '',
    },
    get origin() {
      return this.node.dev
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
      get nextAuthSecret() {
        return this.privateKey;
      },
      oauthProviders: {},
      email: {
        server: 'smtp.gmail.com',
        port: 465,
        login: '',
        sender: '',
        password: '',
      },
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
    redis: {
      enabled: false,
      host: '127.0.0.1',
      port: 6379,
      username: '',
      password: '',
      database: 0,
    },
    doc: {
      manager: {
        updatePollInterval: 3000,
        experimentalMergeWithJwstCodec: false,
      },
    },
  } satisfies AFFiNEConfig;

  applyEnvToConfig(defaultConfig);

  return defaultConfig;
};
