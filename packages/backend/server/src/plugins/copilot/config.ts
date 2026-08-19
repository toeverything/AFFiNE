import serverNativeModule from '@affine/server-native';

import {
  defineNativeModuleConfig,
  StorageJSONSchema,
  StorageProviderConfig,
} from '../../base';
import { CopilotProviderType } from './providers/types';

export type ProviderSpecificConfig = Record<string, unknown>;

export type RustRequestMiddleware =
  | 'normalize_messages'
  | 'clamp_max_tokens'
  | 'tool_schema_rewrite'
  | 'openai_request_compat'
  | 'omit_tool_choice';

export type RustStreamMiddleware =
  | 'stream_event_normalize'
  | 'citation_indexing';

export type NodeTextMiddleware =
  | 'citation_footnote'
  | 'callout'
  | 'thinking_format';

export type ProviderMiddlewareConfig = {
  rust?: { request?: RustRequestMiddleware[]; stream?: RustStreamMiddleware[] };
  node?: { text?: NodeTextMiddleware[] };
};

type CopilotProviderProfileCommon = {
  id: string;
  displayName?: string;
  priority?: number;
  enabled?: boolean;
  models?: string[];
  middleware?: ProviderMiddlewareConfig;
};

export type CopilotProviderProfile = CopilotProviderProfileCommon & {
  type: CopilotProviderType;
  config: ProviderSpecificConfig;
};

declare global {
  interface AppConfigSchema {
    copilot: {
      enabled: boolean;
      byok: {
        enabled: ConfigItem<boolean>;
        allowedProviders: ConfigItem<
          Array<'openai' | 'anthropic' | 'gemini' | 'fal'>
        >;
        allowCustomEndpoint: ConfigItem<boolean>;
        allowPrivateEndpoint: ConfigItem<boolean>;
      };
      unsplash: ConfigItem<{
        key: string;
      }>;
      exa: ConfigItem<{
        key: string;
      }>;
      storage: ConfigItem<StorageProviderConfig>;
      providers: {
        profiles: ConfigItem<CopilotProviderProfile[]>;
      };
    };
  }
}

defineNativeModuleConfig(
  'copilot',
  serverNativeModule.appConfigDescriptors('copilot'),
  serverNativeModule.validateAppConfigValue,
  {
    enabled: {
      desc: 'Enable AI features. Workspace owners configure provider keys in Workspace Settings → Integrations → AI BYOK.',
      default: false,
    },
    unsplash: {
      desc: 'The config for the unsplash key.',
      default: {
        key: '',
      },
    },
    exa: {
      desc: 'The config for the exa web search key.',
      default: {
        key: '',
      },
    },
    storage: {
      desc: 'The config for the storage provider.',
      default: {
        provider: 'fs',
        bucket: 'copilot',
        config: {
          path: '~/.affine/storage',
        },
      },
      schema: StorageJSONSchema,
    },
  }
);
