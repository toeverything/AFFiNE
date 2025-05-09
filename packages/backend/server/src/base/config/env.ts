export type EnvConfigType = 'string' | 'integer' | 'float' | 'boolean';

/**
 * parse number value from environment variables
 */
function integer(value: string) {
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
  integer,
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
