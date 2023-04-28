/// <reference types="../global.d.ts" />
import { createPrivateKey, createPublicKey } from 'node:crypto';

import pkg from '../../package.json' assert { type: 'json' };
import type { AFFiNEConfig } from './def';

// Don't use this in production
export const examplePublicKey = `-----BEGIN PUBLIC KEY-----
MFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAEMsg7HCCBzQrO3sZ1biWY0Yjd4/vDK9J6
wVMCkSxN4eXJiQzKcmk+YlFfeCNgB90VJ8nVtEbAnr/PYOPjxnTvcw==
-----END PUBLIC KEY-----`;

// Don't use this in production
export const examplePrivateKey = `-----BEGIN PRIVATE KEY-----
MIGEAgEAMBAGByqGSM49AgEGBSuBBAAKBG0wawIBAQQgpkap3kxxxfd4xxBBEaYU
fsEVQIvnj4hcLH68U7+0NeqhRANCAAQyyDscIIHNCs7exnVuJZjRiN3j+8Mr0nrB
UwKRLE3h5cmJDMpyaT5iUV94I2AH3RUnydW0RsCev89g4+PGdO9z
-----END PRIVATE KEY-----`;

export const getDefaultAFFiNEConfig: () => AFFiNEConfig = () => ({
  serverId: 'affine-nestjs-server',
  version: pkg.version,
  ENV_MAP: {},
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
    salt: '$2b$10$x4VDo2nmlo74yB5jflNhlu',
    accessTokenExpiresIn: '1h',
    refreshTokenExpiresIn: '7d',
    publicKey: createPublicKey({
      key: examplePublicKey,
      format: 'pem',
      encoding: 'utf8',
    }).export({
      type: 'spki',
      format: 'der',
    }),
    privateKey: createPrivateKey({
      key: examplePrivateKey,
      format: 'pem',
      encoding: 'utf8',
    }).export({
      type: 'sec1',
      format: 'der',
    }),
    enableSignup: true,
    enableOauth: false,
    oauthProviders: {},
  },
  objectStorage: {
    enable: false,
    config: {},
  },
});
