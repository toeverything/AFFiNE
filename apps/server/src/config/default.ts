import pkg from '../../package.json' assert { type: 'json' };
import type { AFFiNEConfig } from './def';

export const getDefaultAFFiNEConfig: () => AFFiNEConfig = () => ({
  secret: 'secret',
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
    enableSignup: true,
    enableOauth: false,
    oauthProviders: {},
  },
  objectStorage: {
    enable: false,
    config: {},
  },
});
