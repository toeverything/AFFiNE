import { upperFirst } from 'lodash-es';
import type { ComponentType } from 'react';

import CONFIG_DESCRIPTORS from '../../config.json';
import type { ConfigInputProps } from './config-input-row';
import { SendTestEmail } from './operations/send-test-email';
export type ConfigType = 'String' | 'Number' | 'Boolean' | 'JSON' | 'Enum';

type ConfigDescriptor = {
  desc: string;
  type: ConfigType;
  env?: string;
  link?: string;
};

export type AppConfig = Record<string, Record<string, any>>;

type AppConfigDescriptors = typeof CONFIG_DESCRIPTORS;
type AppConfigModule = keyof AppConfigDescriptors;
type ModuleConfigDescriptors<M extends AppConfigModule> =
  AppConfigDescriptors[M];
type ConfigGroup<T extends AppConfigModule> = {
  name: string;
  module: T;
  fields: Array<
    | keyof ModuleConfigDescriptors<T>
    | ({
        key: keyof ModuleConfigDescriptors<T>;
        sub?: string;
        desc?: string;
      } & Partial<ConfigInputProps>)
  >;
  operations?: ComponentType<{
    appConfig: AppConfig;
  }>[];
};
const IGNORED_MODULES: (keyof AppConfig)[] = [];

if (environment.isSelfHosted) {
  IGNORED_MODULES.push(
    'payment',
    'customerIo',
    'captcha',
    'telemetry',
    'metrics'
  );
}

const ALL_CONFIGURABLE_MODULES = Object.keys(CONFIG_DESCRIPTORS).filter(
  key => !IGNORED_MODULES.includes(key as keyof AppConfig)
);

export const KNOWN_CONFIG_GROUPS = [
  {
    name: 'Server',
    module: 'server',
    fields: ['externalUrl', 'name', 'hosts'],
  } as ConfigGroup<'server'>,
  {
    name: 'Auth',
    module: 'auth',
    fields: [
      'allowSignup',
      'allowSignupForOauth',
      // nested json object
      {
        key: 'passwordRequirements',
        sub: 'min',
        type: 'Number',
        desc: 'Minimum length requirement of password',
      },
      {
        key: 'passwordRequirements',
        sub: 'max',
        type: 'Number',
        desc: 'Maximum length requirement of password',
      },
    ],
  } as ConfigGroup<'auth'>,
  {
    name: 'Notification',
    module: 'mailer',
    fields: [
      'SMTP.name',
      'SMTP.host',
      'SMTP.port',
      'SMTP.username',
      'SMTP.password',
      'SMTP.ignoreTLS',
      'SMTP.sender',
    ],
    operations: [SendTestEmail],
  } as ConfigGroup<'mailer'>,
  {
    name: 'Storage',
    module: 'storages',
    fields: [
      {
        key: 'blob.storage',
        desc: 'The storage provider for user uploaded blobs',
        sub: 'provider',
        type: 'Enum',
        options: ['fs', 'aws-s3', 'cloudflare-r2'],
      },
      {
        key: 'blob.storage',
        sub: 'bucket',
        type: 'String',
        desc: 'The bucket name for user uploaded blobs storage',
      },
      {
        key: 'blob.storage',
        sub: 'config',
        type: 'JSON',
        desc: 'The config passed directly to the storage provider(e.g. aws-sdk)',
      },
      {
        key: 'avatar.storage',
        desc: 'The storage provider for user avatars',
        sub: 'provider',
        type: 'Enum',
        options: ['fs', 'aws-s3', 'cloudflare-r2'],
      },
      {
        key: 'avatar.storage',
        sub: 'bucket',
        type: 'String',
        desc: 'The bucket name for user avatars storage',
      },
      {
        key: 'avatar.storage',
        sub: 'config',
        type: 'JSON',
        desc: 'The config passed directly to the storage provider(e.g. aws-sdk)',
      },
      {
        key: 'avatar.publicPath',
        type: 'String',
        desc: 'The public path prefix for user avatars(e.g. https://my-bucket.s3.amazonaws.com/)',
      },
    ],
  } as ConfigGroup<'storages'>,
  {
    name: 'OAuth',
    module: 'oauth',
    fields: ['providers.google', 'providers.github', 'providers.oidc'],
  } as ConfigGroup<'oauth'>,
  {
    name: 'AI',
    module: 'copilot',
    fields: [
      'enabled',
      'scenarios',
      'providers.openai',
      'providers.gemini',
      'providers.perplexity',
      'providers.anthropic',
      'providers.fal',
      'unsplash',
      'exa',
      {
        key: 'storage',
        desc: 'The storage provider for copilot blobs',
        sub: 'provider',
        type: 'Enum',
        options: ['fs', 'aws-s3', 'cloudflare-r2'],
      },
      {
        key: 'storage',
        sub: 'bucket',
        type: 'String',
        desc: 'The bucket name for copilot blobs storage',
      },
      {
        key: 'storage',
        sub: 'config',
        type: 'JSON',
        desc: 'The config passed directly to the storage provider(e.g. aws-sdk)',
      },
    ],
  } as ConfigGroup<'copilot'>,
];

export const UNKNOWN_CONFIG_GROUPS = ALL_CONFIGURABLE_MODULES.filter(
  module => !KNOWN_CONFIG_GROUPS.some(group => group.module === module)
).map(module => ({
  name: upperFirst(module),
  module,
  // @ts-expect-error allow
  fields: Object.keys(CONFIG_DESCRIPTORS[module]),
  operations: undefined,
}));

export const ALL_SETTING_GROUPS = [
  ...KNOWN_CONFIG_GROUPS,
  ...UNKNOWN_CONFIG_GROUPS,
];

export const ALL_CONFIG_DESCRIPTORS = CONFIG_DESCRIPTORS as Record<
  string,
  Record<string, ConfigDescriptor>
>;
