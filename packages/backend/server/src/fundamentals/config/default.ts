import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pkg from '../../../package.json' assert { type: 'json' };
import {
  AFFINE_ENV,
  AFFiNEConfig,
  DeploymentType,
  NODE_ENV,
  PreDefinedAFFiNEConfig,
  ServerFlavor,
} from './def';
import { readEnv } from './env';
import { defaultStartupConfig } from './register';

function getPredefinedAFFiNEConfig(): PreDefinedAFFiNEConfig {
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
    'renderer',
  ]);
  const deploymentType = readEnv<DeploymentType>(
    'DEPLOYMENT_TYPE',
    NODE_ENV === 'development'
      ? DeploymentType.Affine
      : DeploymentType.Selfhosted,
    Object.values(DeploymentType)
  );
  const isSelfhosted = deploymentType === DeploymentType.Selfhosted;
  const affine = {
    canary: AFFINE_ENV === 'dev',
    beta: AFFINE_ENV === 'beta',
    stable: AFFINE_ENV === 'production',
  };
  const node = {
    prod: NODE_ENV === 'production',
    dev: NODE_ENV === 'development',
    test: NODE_ENV === 'test',
  };

  return {
    ENV_MAP: {},
    NODE_ENV,
    AFFINE_ENV,
    serverId: 'some-randome-uuid',
    serverName: isSelfhosted ? 'Self-Host Cloud' : 'AFFiNE Cloud',
    version: pkg.version,
    type: deploymentType,
    isSelfhosted,
    flavor: {
      type: flavor,
      allinone: flavor === 'allinone',
      graphql: flavor === 'graphql' || flavor === 'allinone',
      sync: flavor === 'sync' || flavor === 'allinone',
      renderer: flavor === 'renderer' || flavor === 'allinone',
    },
    affine,
    node,
    deploy: !node.dev && !node.test,
    projectRoot: resolve(fileURLToPath(import.meta.url), '../../../../'),
  };
}

export function getAFFiNEConfigModifier(): AFFiNEConfig {
  const predefined = getPredefinedAFFiNEConfig() as AFFiNEConfig;

  return chainableProxy(predefined);
}

function merge(a: any, b: any) {
  if (typeof b !== 'object' || b instanceof Map || b instanceof Set) {
    return b;
  }

  if (Array.isArray(b)) {
    if (Array.isArray(a)) {
      return a.concat(b);
    }
    return b;
  }

  const result = { ...a };
  Object.keys(b).forEach(key => {
    result[key] = merge(result[key], b[key]);
  });

  return result;
}

export function mergeConfigOverride(override: any) {
  return merge(defaultStartupConfig, override);
}

function chainableProxy(obj: any) {
  const keys: Set<string> = new Set(Object.keys(obj));
  return new Proxy(obj, {
    get(target, prop) {
      if (!(prop in target)) {
        keys.add(prop as string);
        target[prop] = chainableProxy({});
      }
      return target[prop];
    },
    set(target, prop, value) {
      keys.add(prop as string);
      if (
        typeof value === 'object' &&
        !(
          value instanceof Map ||
          value instanceof Set ||
          value instanceof Array
        )
      ) {
        value = chainableProxy(value);
      }
      target[prop] = value;
      return true;
    },
    ownKeys() {
      return Array.from(keys);
    },
  });
}
