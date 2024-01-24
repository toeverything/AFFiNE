/// <reference types="../../global.d.ts" />

import { createPrivateKey, createPublicKey } from 'node:crypto';

import { merge } from 'lodash-es';
import parse from 'parse-duration';

import pkg from '../../../package.json' assert { type: 'json' };
import type { AFFiNEConfig, ServerFlavor } from './def';
import { getDefaultAFFiNEStorageConfig } from './storage';

// Don't use this in production
const examplePrivateKey = `-----BEGIN EC PRIVATE KEY-----
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
  let isHttps: boolean | null = null;
  let flavor = (process.env.SERVER_FLAVOR ?? 'allinone') as ServerFlavor;
  const defaultConfig = {
    serverId: 'affine-nestjs-server',
    serverName: flavor === 'selfhosted' ? 'Self-Host Cloud' : 'AFFiNE Cloud',
    version: pkg.version,
    get flavor() {
      if (flavor === 'graphql') {
        flavor = 'main';
      }
      return {
        type: flavor,
        main: flavor === 'main' || flavor === 'allinone',
        sync: flavor === 'sync' || flavor === 'allinone',
        selfhosted: flavor === 'selfhosted',
      };
    },
    ENV_MAP: {},
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
    featureFlags: {
      earlyAccessPreview: false,
    },
    get https() {
      return isHttps ?? !this.node.dev;
    },
    set https(value: boolean) {
      isHttps = value;
    },
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
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      accessTokenExpiresIn: parse('1h')! / 1000,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      refreshTokenExpiresIn: parse('7d')! / 1000,
      leeway: 60,
      captcha: {
        enable: false,
        turnstile: {
          secret: '1x0000000000000000000000000000000AA',
        },
        challenge: {
          bits: 20,
        },
      },
      privateKey: jwtKeyPair.privateKey,
      publicKey: jwtKeyPair.publicKey,
      enableSignup: true,
      enableOauth: false,
      get nextAuthSecret() {
        return this.privateKey;
      },
      oauthProviders: {},
      localEmail: false,
      email: {
        server: 'smtp.gmail.com',
        port: 465,
        login: '',
        sender: '',
        password: '',
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
        experimentalMergeWithJwstCodec: false,
      },
      history: {
        interval: 1000 * 60 * 10 /* 10 mins */,
      },
    },
    metrics: {
      enabled: false,
    },
    plugins: {
      enabled: [],
      use(plugin, config) {
        this[plugin] = merge(this[plugin], config || {});
        this.enabled.push(plugin);
      },
    },
  } satisfies AFFiNEConfig;

  return defaultConfig;
};
