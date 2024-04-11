import { set } from 'lodash-es';

import type { AFFiNEConfig, EnvConfigType } from './def';

/**
 * parse number value from environment variables
 */
function int(value: string) {
  const n = parseInt(value);
  return Number.isNaN(n) ? undefined : n;
}

function float(value: string) {
  const n = parseFloat(value);
  return Number.isNaN(n) ? undefined : n;
}

function boolean(value: string) {
  return value === '1' || value.toLowerCase() === 'true';
}

const envParsers: Record<EnvConfigType, (value: string) => unknown> = {
  int,
  float,
  boolean,
  string: value => value,
};

export function parseEnvValue(value: string | undefined, type: EnvConfigType) {
  if (value === undefined) {
    return;
  }

  return envParsers[type](value);
}

export function applyEnvToConfig(rawConfig: AFFiNEConfig) {
  for (const env in rawConfig.ENV_MAP) {
    const config = rawConfig.ENV_MAP[env];
    const [path, value] =
      typeof config === 'string'
        ? [config, parseEnvValue(process.env[env], 'string')]
        : [config[0], parseEnvValue(process.env[env], config[1] ?? 'string')];

    if (value !== undefined) {
      set(rawConfig, path, value);
    }
  }
}

export function readEnv<T>(
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
      `Invalid value '${value}' for environment variable ${env}, expected one of [${availableValues.join(
        ', '
      )}]`
    );
  }

  return value as T;
}
