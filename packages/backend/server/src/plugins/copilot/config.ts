import { z } from 'zod';

import {
  defineModuleConfig,
  StorageJSONSchema,
  StorageProviderConfig,
} from '../../base';
import { CopilotPromptScenario } from './prompt/prompts';
import {
  AnthropicOfficialConfig,
  AnthropicVertexConfig,
} from './providers/anthropic';
import type { FalConfig } from './providers/fal';
import { GeminiGenerativeConfig, GeminiVertexConfig } from './providers/gemini';
import { MorphConfig } from './providers/morph';
import { OpenAIConfig } from './providers/openai';
import { PerplexityConfig } from './providers/perplexity';
import {
  CopilotProviderType,
  ModelOutputType,
  VertexSchema,
} from './providers/types';

export type CopilotProviderConfigMap = {
  [CopilotProviderType.OpenAI]: OpenAIConfig;
  [CopilotProviderType.FAL]: FalConfig;
  [CopilotProviderType.Gemini]: GeminiGenerativeConfig;
  [CopilotProviderType.GeminiVertex]: GeminiVertexConfig;
  [CopilotProviderType.Perplexity]: PerplexityConfig;
  [CopilotProviderType.Anthropic]: AnthropicOfficialConfig;
  [CopilotProviderType.AnthropicVertex]: AnthropicVertexConfig;
  [CopilotProviderType.Morph]: MorphConfig;
};

export type ProviderSpecificConfig =
  CopilotProviderConfigMap[keyof CopilotProviderConfigMap];

export const RustRequestMiddlewareValues = [
  'normalize_messages',
  'clamp_max_tokens',
  'tool_schema_rewrite',
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
  models?: string[];
  middleware?: ProviderMiddlewareConfig;
};

type CopilotProviderProfileVariant<T extends CopilotProviderType> = {
  type: T;
  config: CopilotProviderConfigMap[T];
};

export type CopilotProviderProfile = CopilotProviderProfileCommon &
  {
    [Type in CopilotProviderType]: CopilotProviderProfileVariant<Type>;
  }[CopilotProviderType];

export type CopilotProviderDefaults = Partial<
  Record<ModelOutputType, string>
> & {
  fallback?: string;
};

const CopilotProviderProfileBaseShape = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-_]+$/),
  displayName: z.string().optional(),
  priority: z.number().optional(),
  enabled: z.boolean().optional(),
  models: z.array(z.string()).optional(),
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

const OpenAIConfigShape = z.object({
  apiKey: z.string(),
  baseURL: z.string().optional(),
  oldApiStyle: z.boolean().optional(),
});

const FalConfigShape = z.object({
  apiKey: z.string(),
});

const GeminiGenerativeConfigShape = z.object({
  apiKey: z.string(),
  baseURL: z.string().optional(),
});

const VertexProviderConfigShape = z.object({
  location: z.string().optional(),
  project: z.string().optional(),
  baseURL: z.string().optional(),
  googleAuthOptions: z.any().optional(),
  fetch: z.any().optional(),
});

const PerplexityConfigShape = z.object({
  apiKey: z.string(),
  endpoint: z.string().optional(),
});

const AnthropicOfficialConfigShape = z.object({
  apiKey: z.string(),
  baseURL: z.string().optional(),
});

const MorphConfigShape = z.object({
  apiKey: z.string().optional(),
});

const CopilotProviderProfileShape = z.discriminatedUnion('type', [
  CopilotProviderProfileBaseShape.extend({
    type: z.literal(CopilotProviderType.OpenAI),
    config: OpenAIConfigShape,
  }),
  CopilotProviderProfileBaseShape.extend({
    type: z.literal(CopilotProviderType.FAL),
    config: FalConfigShape,
  }),
  CopilotProviderProfileBaseShape.extend({
    type: z.literal(CopilotProviderType.Gemini),
    config: GeminiGenerativeConfigShape,
  }),
  CopilotProviderProfileBaseShape.extend({
    type: z.literal(CopilotProviderType.GeminiVertex),
    config: VertexProviderConfigShape,
  }),
  CopilotProviderProfileBaseShape.extend({
    type: z.literal(CopilotProviderType.Perplexity),
    config: PerplexityConfigShape,
  }),
  CopilotProviderProfileBaseShape.extend({
    type: z.literal(CopilotProviderType.Anthropic),
    config: AnthropicOfficialConfigShape,
  }),
  CopilotProviderProfileBaseShape.extend({
    type: z.literal(CopilotProviderType.AnthropicVertex),
    config: VertexProviderConfigShape,
  }),
  CopilotProviderProfileBaseShape.extend({
    type: z.literal(CopilotProviderType.Morph),
    config: MorphConfigShape,
  }),
]);

const CopilotProviderDefaultsShape = z.object({
  [ModelOutputType.Text]: z.string().optional(),
  [ModelOutputType.Object]: z.string().optional(),
  [ModelOutputType.Embedding]: z.string().optional(),
  [ModelOutputType.Image]: z.string().optional(),
  [ModelOutputType.Structured]: z.string().optional(),
  fallback: z.string().optional(),
});

declare global {
  interface AppConfigSchema {
    copilot: {
      enabled: boolean;
      unsplash: ConfigItem<{
        key: string;
      }>;
      exa: ConfigItem<{
        key: string;
      }>;
      storage: ConfigItem<StorageProviderConfig>;
      scenarios: ConfigItem<CopilotPromptScenario>;
      providers: {
        profiles: ConfigItem<CopilotProviderProfile[]>;
        defaults: ConfigItem<CopilotProviderDefaults>;
        openai: ConfigItem<OpenAIConfig>;
        fal: ConfigItem<FalConfig>;
        gemini: ConfigItem<GeminiGenerativeConfig>;
        geminiVertex: ConfigItem<GeminiVertexConfig>;
        perplexity: ConfigItem<PerplexityConfig>;
        anthropic: ConfigItem<AnthropicOfficialConfig>;
        anthropicVertex: ConfigItem<AnthropicVertexConfig>;
        morph: ConfigItem<MorphConfig>;
      };
    };
  }
}

defineModuleConfig('copilot', {
  enabled: {
    desc: 'Whether to enable the copilot plugin. <br> Document: <a href="https://docs.affine.pro/self-host-affine/administer/ai" target="_blank">https://docs.affine.pro/self-host-affine/administer/ai</a>',
    default: false,
  },
  scenarios: {
    desc: 'Use custom models in scenarios and override default settings.',
    default: {
      override_enabled: false,
      scenarios: {
        audio_transcribing: 'gemini-2.5-flash',
        chat: 'gemini-2.5-flash',
        embedding: 'gemini-embedding-001',
        image: 'gpt-image-1',
        coding: 'claude-sonnet-4-5@20250929',
        complex_text_generation: 'gpt-5-mini',
        quick_decision_making: 'gpt-5-mini',
        quick_text_generation: 'gemini-2.5-flash',
        polish_and_summarize: 'gemini-2.5-flash',
      },
    },
  },
  'providers.profiles': {
    desc: 'The profile list for copilot providers.',
    default: [],
    shape: z.array(CopilotProviderProfileShape),
  },
  'providers.defaults': {
    desc: 'The default provider ids for model output types and global fallback.',
    default: {},
    shape: CopilotProviderDefaultsShape,
  },
  'providers.openai': {
    desc: 'The config for the openai provider.',
    default: {
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
    },
    link: 'https://github.com/openai/openai-node',
  },
  'providers.fal': {
    desc: 'The config for the fal provider.',
    default: {
      apiKey: '',
    },
  },
  'providers.gemini': {
    desc: 'The config for the gemini provider.',
    default: {
      apiKey: '',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
    },
  },
  'providers.geminiVertex': {
    desc: 'The config for the gemini provider in Google Vertex AI.',
    default: {},
    schema: VertexSchema,
  },
  'providers.perplexity': {
    desc: 'The config for the perplexity provider.',
    default: {
      apiKey: '',
    },
  },
  'providers.anthropic': {
    desc: 'The config for the anthropic provider.',
    default: {
      apiKey: '',
      baseURL: 'https://api.anthropic.com/v1',
    },
  },
  'providers.anthropicVertex': {
    desc: 'The config for the anthropic provider in Google Vertex AI.',
    default: {},
    schema: VertexSchema,
  },
  'providers.morph': {
    desc: 'The config for the morph provider.',
    default: {},
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
