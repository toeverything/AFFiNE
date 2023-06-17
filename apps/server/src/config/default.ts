/// <reference types="../global.d.ts" />

import { homedir } from 'node:os';
import { join } from 'node:path';

import parse from 'parse-duration';

import pkg from '../../package.json' assert { type: 'json' };
import type { AFFiNEConfig } from './def';

// Don't use this in production
export const examplePublicKey = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEnxM+GhB6eNKPmTP6uH5Gpr+bmQ87
hHGeOiCsay0w/aPwMqzAOKkZGqX+HZ9BNGy/yiXmnscey5b2vOTzxtRvxA==
-----END PUBLIC KEY-----`;

// Don't use this in production
export const examplePrivateKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgWOog5SFXs1Vjh/WP
QCYPQKgf/jsNmWsvD+jYSn6mi3yhRANCAASfEz4aEHp40o+ZM/q4fkamv5uZDzuE
cZ46IKxrLTD9o/AyrMA4qRkapf4dn0E0bL/KJeaexx7Llva85PPG1G/E
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    accessTokenExpiresIn: parse('1h')! / 1000,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    refreshTokenExpiresIn: parse('7d')! / 1000,
    leeway: 60,
    publicKey: examplePublicKey,
    privateKey: examplePrivateKey,
    enableSignup: true,
    enableOauth: false,
    nextAuthSecret: '',
    oauthProviders: {},
  },
  objectStorage: {
    enable: false,
    config: {},
    fs: {
      path: join(homedir(), '.affine-storage'),
    },
  },
});
