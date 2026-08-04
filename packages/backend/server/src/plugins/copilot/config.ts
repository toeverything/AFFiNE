import { z } from 'zod';

import {
  defineModuleConfig,
  StorageJSONSchema,
  StorageProviderConfig,
} from '../../base';
import { CopilotProviderType } from './providers/types';

export type ProviderSpecificConfig = Record<string, unknown>;

export const RustRequestMiddlewareValues = [
  'normalize_messages',
  'clamp_max_tokens',
  'tool_schema_rewrite',
  'openai_request_compat',
  'omit_tool_choice',
] as const;
export type RustRequestMiddleware =
  (typeof RustRequestMiddlewareValues)[number];

export const RustStreamMiddlewareValues = [
  'stream_event_normalize',
  'citation_indexing',
] as const;
export type RustStreamMiddleware = (typeof RustStreamMiddlewareValues)[number];

export const NodeTextMiddlewareValues = [
  'citation_footnote',
  'callout',
  'thinking_format',
] as const;
export type NodeTextMiddleware = (typeof NodeTextMiddlewareValues)[number];

export type ProviderMiddlewareConfig = {
  rust?: { request?: RustRequestMiddleware[]; stream?: RustStreamMiddleware[] };
  node?: { text?: NodeTextMiddleware[] };
};

type CopilotProviderProfileCommon = {
  id: string;
  displayName?: string;
  priority?: number;
  enabled?: boolean;
  models: string[];
  middleware?: ProviderMiddlewareConfig;
};

export type CopilotProviderProfile = CopilotProviderProfileCommon & {
  type: CopilotProviderType;
  config: ProviderSpecificConfig;
};

const CopilotProviderProfileBaseShape = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-_]+$/),
  displayName: z.string().optional(),
  priority: z.number().optional(),
  enabled: z.boolean().optional(),
  models: z.array(z.string().min(1)).min(1),
  middleware: z
    .object({
      rust: z
        .object({
          request: z.array(z.enum(RustRequestMiddlewareValues)).optional(),
          stream: z.array(z.enum(RustStreamMiddlewareValues)).optional(),
        })
        .optional(),
      node: z
        .object({ text: z.array(z.enum(NodeTextMiddlewareValues)).optional() })
        .optional(),
    })
    .optional(),
});

const CopilotProviderProfileShape = CopilotProviderProfileBaseShape.extend({
  type: z.nativeEnum(CopilotProviderType),
  config: z.record(z.string(), z.unknown()),
});

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

defineModuleConfig('copilot', {
  enabled: {
    desc: 'Enable AI features. Workspace owners configure provider keys in Workspace Settings → Integrations → AI BYOK.',
    default: false,
  },
  'byok.enabled': {
    desc: 'Allow workspace owners and admins to configure AI provider keys through AI BYOK.',
    default: true,
    shape: z.boolean(),
  },
  'byok.allowedProviders': {
    desc: 'AI providers that workspace owners and admins may add through AI BYOK.',
    default: ['openai', 'anthropic', 'gemini', 'fal'],
    shape: z.array(z.enum(['openai', 'anthropic', 'gemini', 'fal'])),
  },
  'byok.allowCustomEndpoint': {
    desc: 'Allow AI BYOK keys to use a custom provider endpoint.',
    default: false,
    shape: z.boolean(),
  },
  'byok.allowPrivateEndpoint': {
    desc: 'Whether workspace BYOK custom endpoints may resolve to private network targets. Enabling this allows workspace owners and admins to send provider probe requests to the private network.',
    default: false,
    shape: z.boolean(),
  },
  'providers.profiles': {
    desc: 'The profile list for copilot providers.',
    default: [],
    shape: z.array(CopilotProviderProfileShape),
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
});
