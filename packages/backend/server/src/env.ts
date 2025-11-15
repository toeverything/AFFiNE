import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pkg from '../package.json' with { type: 'json' };

declare global {
  namespace globalThis {
    // oxlint-disable-next-line no-var
    var env: Readonly<Env>;
    // oxlint-disable-next-line no-var
    var readEnv: <T>(key: string, defaultValue: T, availableValues?: T[]) => T;
    // oxlint-disable-next-line no-var
    var CUSTOM_CONFIG_PATH: string;
    // oxlint-disable-next-line no-var
    var CLS_REQUEST_HOST: 'CLS_REQUEST_HOST';
  }
}

export enum Flavor {
  AllInOne = 'allinone',
  Graphql = 'graphql',
  Sync = 'sync',
  Renderer = 'renderer',
  Doc = 'doc',
  Script = 'script',
}

export enum Namespace {
  Dev = 'dev',
  Beta = 'beta',
  Production = 'production',
}

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export enum DeploymentType {
  Affine = 'affine',
  Selfhosted = 'selfhosted',
}

export enum Platform {
  GCP = 'gcp',
  Unknown = 'unknown',
}

export type AppEnv = {
  NODE_ENV: NodeEnv;
  NAMESPACE: Namespace;
  DEPLOYMENT_TYPE: DeploymentType;
  version: string;
};

globalThis.CLS_REQUEST_HOST = 'CLS_REQUEST_HOST';
globalThis.CUSTOM_CONFIG_PATH = join(homedir(), '.affine/config');
globalThis.readEnv = function readEnv<T>(
  env: string,
  defaultValue: T,
  availableValues?: T[]
) {
  const value = process.env[env];
  if (value === undefined) {
    return defaultValue;
  }

  if (availableValues && !availableValues.includes(value as any)) {
    throw new Error(
      `Invalid value "${value}" for environment variable ${env}, expected one of ${JSON.stringify(
        availableValues
      )}`
    );
  }

  return value as T;
};

export class Env implements AppEnv {
  NODE_ENV = (process.env.NODE_ENV ?? NodeEnv.Production) as NodeEnv;
  NAMESPACE = readEnv(
    'AFFINE_ENV',
    Namespace.Production,
    Object.values(Namespace)
  );
  DEPLOYMENT_TYPE = readEnv(
    'DEPLOYMENT_TYPE',
    this.dev ? DeploymentType.Affine : DeploymentType.Selfhosted,
    Object.values(DeploymentType)
  );
  FLAVOR = readEnv('SERVER_FLAVOR', Flavor.AllInOne, Object.values(Flavor));
  platform = readEnv('DEPLOYMENT_PLATFORM', Platform.Unknown);
  version = pkg.version;
  projectRoot = resolve(fileURLToPath(import.meta.url), '../../');

  get selfhosted() {
    return this.DEPLOYMENT_TYPE === DeploymentType.Selfhosted;
  }

  isFlavor(flavor: Flavor) {
    return this.FLAVOR === flavor || this.FLAVOR === Flavor.AllInOne;
  }

  get flavors() {
    return {
      graphql: this.isFlavor(Flavor.Graphql),
      sync: this.isFlavor(Flavor.Sync),
      renderer: this.isFlavor(Flavor.Renderer),
      doc: this.isFlavor(Flavor.Doc),
      // Script in a special flavor, return true only when it is set explicitly
      script: this.FLAVOR === Flavor.Script,
    };
  }

  get namespaces() {
    return {
      canary: this.NAMESPACE === Namespace.Dev,
      beta: this.NAMESPACE === Namespace.Beta,
      production: this.NAMESPACE === Namespace.Production,
    };
  }

  get testing() {
    return this.NODE_ENV === NodeEnv.Test;
  }

  get dev() {
    return this.NODE_ENV === NodeEnv.Development;
  }

  get prod() {
    return this.NODE_ENV === NodeEnv.Production;
  }

  get gcp() {
    return this.platform === Platform.GCP;
  }

  constructor() {
    if (!Object.values(NodeEnv).includes(this.NODE_ENV)) {
      throw new Error(
        `Invalid NODE_ENV environment. \`${this.NODE_ENV}\` is not a valid NODE_ENV value.`
      );
    }
  }
}

export const createGlobalEnv = () => {
  if (!globalThis.env) {
    globalThis.env = new Env();
  }
};
