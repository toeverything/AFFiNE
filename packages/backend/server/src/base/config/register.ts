import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { mergeWith, once, set } from 'lodash-es';
import { z } from 'zod';

import { type EnvConfigType, parseEnvValue } from './env';
import { AppConfigByPath } from './types';

export type JSONSchema = { description?: string } & (
  | { type?: undefined; oneOf?: JSONSchema[] }
  | {
      type: 'string' | 'number' | 'boolean';
      enum?: string[];
    }
  | {
      type: 'array';
      items?: JSONSchema;
    }
  | {
      type: 'object';
      properties?: Record<string, JSONSchema>;
    }
);

type ConfigType = EnvConfigType | 'array' | 'object' | 'any';
export type ConfigDescriptor<T> = {
  desc: string;
  type: ConfigType;
  validate: (value: T) => z.SafeParseReturnType<T, T>;
  schema: JSONSchema;
  default: T;
  env?: [string, EnvConfigType];
  link?: string;
};

type ConfigDefineDescriptor<T> = {
  desc: string;
  default: T;
  validate?: (value: T) => z.SafeParseReturnType<T, T>;
  shape?: z.ZodType<T>;
  env?: string | [string, EnvConfigType];
  link?: string;
  schema?: JSONSchema;
};

function typeFromShape(shape: z.ZodType<any>): ConfigType {
  switch (shape.constructor) {
    case z.ZodString:
      return 'string';
    case z.ZodNumber:
      return 'float';
    case z.ZodBoolean:
      return 'boolean';
    case z.ZodArray:
      return 'array';
    case z.ZodObject:
      return 'object';
    case z.ZodOptional:
    case z.ZodNullable:
      // @ts-expect-error checked
      return typeFromShape(shape.unwrap());
    default:
      return 'any';
  }
}

function shapeFromType(type: ConfigType): z.ZodType<any> {
  switch (type) {
    case 'string':
      return z.string();
    case 'float':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'integer':
      return z.number().int();
    case 'array':
      return z.array(z.any());
    case 'object':
      return z.object({});
    default:
      return z.any();
  }
}

function typeFromSchema(schema: JSONSchema): ConfigType {
  if ('type' in schema) {
    switch (schema.type) {
      case 'string':
        return 'string';
      case 'number':
        return 'float';
      case 'boolean':
        return 'boolean';
      case 'array':
        return 'array';
      case 'object':
        return 'object';
    }
  }

  return 'any';
}

function schemaFromType(type: ConfigType): JSONSchema['type'] {
  switch (type) {
    case 'any':
      return undefined;
    case 'float':
    case 'integer':
      return 'number';
    default:
      return type;
  }
}

function typeFromDefault<T>(defaultValue: T): ConfigType {
  if (Array.isArray(defaultValue)) {
    return 'array';
  }

  switch (typeof defaultValue) {
    case 'string':
      return 'string';
    case 'number':
      return 'float';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      return 'any';
  }
}

function standardizeDescriptor<T>(
  desc: ConfigDefineDescriptor<T>
): ConfigDescriptor<T> {
  const env = desc.env
    ? Array.isArray(desc.env)
      ? desc.env
      : ([desc.env, 'string'] as [string, EnvConfigType])
    : undefined;

  let type: ConfigType = 'any';

  if (desc.default !== undefined && desc.default !== null) {
    type = typeFromDefault(desc.default);
  } else if (env) {
    type = env[1];
  } else if (desc.shape) {
    type = typeFromShape(desc.shape);
  } else if (desc.schema) {
    type = typeFromSchema(desc.schema);
  }

  const shape = desc.shape ?? shapeFromType(type);

  return {
    desc: desc.desc,
    default: desc.default,
    type,
    validate: (value: T) => {
      return desc.validate ? desc.validate(value) : shape.safeParse(value);
    },
    env,
    link: desc.link,
    schema: {
      type: schemaFromType(type),
      description: desc.desc,
      ...desc.schema,
    },
  };
}

type ModuleConfigDescriptors<T> = {
  [K in keyof T]: ConfigDefineDescriptor<T[K]>;
};

export const APP_CONFIG_DESCRIPTORS: Record<
  string,
  Record<string, ConfigDescriptor<any>>
> = {};

export const getDescriptors = once(() => {
  return Object.entries(APP_CONFIG_DESCRIPTORS).map(
    ([module, descriptors]) => ({
      module,
      descriptors: Object.entries(descriptors).map(([key, descriptor]) => ({
        key,
        descriptor,
      })),
    })
  );
});

export function defineModuleConfig<T extends keyof AppConfigSchema>(
  module: T,
  defs: ModuleConfigDescriptors<AppConfigByPath<T>>
) {
  const descriptors: Record<string, ConfigDescriptor<any>> = {};
  Object.entries(defs).forEach(([key, desc]) => {
    descriptors[key] = standardizeDescriptor(
      desc as ConfigDefineDescriptor<any>
    );
  });

  APP_CONFIG_DESCRIPTORS[module] = {
    ...APP_CONFIG_DESCRIPTORS[module],
    ...descriptors,
  };
}

const CONFIG_JSON_PATHS = [
  join(env.projectRoot, 'config.json'),
  `${homedir()}/.affine/config/config.json`,
];
function readConfigJSONOverrides(path: string) {
  const overrides: DeepPartial<AppConfig> = {};
  if (existsSync(path)) {
    try {
      const config = JSON.parse(readFileSync(path, 'utf-8')) as AppConfig;

      Object.entries(config).forEach(([key, value]) => {
        if (key === '$schema') {
          return;
        }

        Object.entries(value).forEach(([k, v]) => {
          set(overrides, `${key}.${k}`, v);
        });
      });
    } catch (e) {
      console.error('Invalid json config file', e);
    }
  }

  return overrides;
}

export function override(config: AppConfig, update: DeepPartial<AppConfig>) {
  Object.keys(update).forEach(module => {
    const moduleDescriptors = APP_CONFIG_DESCRIPTORS[module];
    // ignore unknown config module
    if (!moduleDescriptors) {
      return;
    }

    const configKeys = new Set(Object.keys(moduleDescriptors));

    const moduleConfig = config[module as keyof AppConfig];
    const moduleOverrides = update[module as keyof AppConfig];

    const merge = (left: any, right: any, path: string = '') => {
      // if we found the key in the config keys
      // we should use the override object instead of merge it with left
      if (configKeys.has(path)) {
        return right;
      }

      // EDGE CASE:
      //   the right value is primitive and we're still not finding the key in descriptors,
      //   which means the overrides has keys not defined
      //   that's where we should return
      if (typeof right !== 'object') {
        return left;
      }

      // go deeper
      return mergeWith(left, right, (left, right, key) => {
        return merge(left, right, path === '' ? key : `${path}.${key}`);
      });
    };

    config[module as keyof AppConfig] = merge(moduleConfig, moduleOverrides);
  });
}

export function getDefaultConfig(): AppConfig {
  const config = {} as AppConfig;
  const envs = process.env;

  for (const [module, defs] of Object.entries(APP_CONFIG_DESCRIPTORS)) {
    const modulizedConfig = {};

    for (const [key, desc] of Object.entries(defs)) {
      let defaultValue = desc.default;

      if (desc.env) {
        const [env, parser] = desc.env;
        const envValue = envs[env];
        if (envValue) {
          defaultValue = parseEnvValue(envValue, parser);
        }
      }

      const { success, error } = desc.validate(defaultValue);

      if (!success) {
        throw new Error(
          error.issues
            .map(issue => {
              return `Invalid config for module [${module}] with key [${key}]
Value: ${JSON.stringify(defaultValue)}
Error: ${issue.message}`;
            })
            .join('\n')
        );
      }

      set(modulizedConfig, key, defaultValue);
    }

    // @ts-expect-error all keys are known
    config[module] = modulizedConfig;
  }

  CONFIG_JSON_PATHS.forEach(path => {
    const overrides = readConfigJSONOverrides(path);
    override(config, overrides);
  });

  return config as AppConfigSchema;
}
