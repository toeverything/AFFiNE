/// <reference types="../../global.d.ts" />

import { createPrivateKey, createPublicKey } from 'node:crypto';

import { merge } from 'lodash-es';

import pkg from '../../../package.json' assert { type: 'json' };
import {
  type AFFINE_ENV,
  AFFiNEConfig,
  DeploymentType,
  type NODE_ENV,
  type ServerFlavor,
} from './def';
import { readEnv } from './env';
import { getDefaultAFFiNEStorageConfig } from './storage';

// Don't use this in production
const examplePrivateKey = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIEtyAJLIULkphVhqXqxk4Nr8Ggty3XLwUJWBxzAWCWTMoAoGCCqGSM49
AwEHoUQDQgAEF3U/0wIeJ3jRKXeFKqQyBKlr9F7xaAUScRrAuSP33rajm3cdfihI
3JvMxVNsS2lE8PSGQrvDrJZaDo0L+Lq9Gg==
-----END EC PRIVATE KEY-----`;

const ONE_DAY_IN_SEC = 60 * 60 * 24;

const keyPair = (function () {
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
  const NODE_ENV = readEnv<NODE_ENV>('NODE_ENV', 'development', [
    'development',
    'test',
    'production',
  ]);
  const AFFINE_ENV = readEnv<AFFINE_ENV>('AFFINE_ENV', 'dev', [
    'dev',
    'beta',
    'production',
  ]);
  const flavor = readEnv<ServerFlavor>('SERVER_FLAVOR', 'allinone', [
    'allinone',
    'graphql',
    'sync',
  ]);
  const deploymentType = readEnv<DeploymentType>(
    'DEPLOYMENT_TYPE',
    NODE_ENV === 'development'
      ? DeploymentType.Affine
      : DeploymentType.Selfhosted,
    Object.values(DeploymentType)
  );
  const isSelfhosted = deploymentType === DeploymentType.Selfhosted;

  const defaultConfig = {
    serverId: 'affine-nestjs-server',
    serverName: isSelfhosted ? 'Self-Host Cloud' : 'AFFiNE Cloud',
    version: pkg.version,
    get type() {
      return deploymentType;
    },
    get isSelfhosted() {
      return isSelfhosted;
    },
    get flavor() {
      return {
        type: flavor,
        graphql: flavor === 'graphql' || flavor === 'allinone',
        sync: flavor === 'sync' || flavor === 'allinone',
      };
    },
    ENV_MAP: {},
    AFFINE_ENV,
    get affine() {
      return {
        canary: AFFINE_ENV === 'dev',
        beta: AFFINE_ENV === 'beta',
        stable: AFFINE_ENV === 'production',
      };
    },
    NODE_ENV,
    get node() {
      return {
        prod: NODE_ENV === 'production',
        dev: NODE_ENV === 'development',
        test: NODE_ENV === 'test',
      };
    },
    get deploy() {
      return !this.node.dev && !this.node.test;
    },
    secrets: {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    },
    featureFlags: {
      earlyAccessPreview: false,
      syncClientVersionCheck: false,
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
            this.host === 'localhost' || this.host === '0.0.0.0'
              ? `:${this.port}`
              : ''
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
      session: {
        ttl: 15 * ONE_DAY_IN_SEC,
      },
      accessToken: {
        ttl: 7 * ONE_DAY_IN_SEC,
        refreshTokenTtl: 30 * ONE_DAY_IN_SEC,
      },
      captcha: {
        enable: false,
        turnstile: {
          secret: '1x0000000000000000000000000000000AA',
        },
        challenge: {
          bits: 20,
        },
      },
    },
    storage: getDefaultAFFiNEStorageConfig(),
    rateLimiter: {
      ttl: 60,
      limit: 120,
    },
    doc: {
      manager: {
        enableUpdateAutoMerging: flavor !== 'sync',
        updatePollInterval: 3000,
        maxUpdatesPullCount: 500,
        experimentalMergeWithYOcto: false,
      },
      history: {
        interval: 1000 * 60 * 10 /* 10 mins */,
      },
    },
    metrics: {
      enabled: false,
    },
    plugins: {
      enabled: new Set(),
      use(plugin, config) {
        this[plugin] = merge(this[plugin], config || {});
        this.enabled.add(plugin);
      },
    },
  } satisfies AFFiNEConfig;

  return defaultConfig;
};
