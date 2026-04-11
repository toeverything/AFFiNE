import type { ProviderMiddlewareConfig } from '../config';
import { CopilotProviderType } from './types';

const DEFAULT_MIDDLEWARE_BY_TYPE: Record<
  CopilotProviderType,
  ProviderMiddlewareConfig
> = {
  [CopilotProviderType.OpenAI]: {
    rust: {
      request: ['normalize_messages'],
      stream: ['stream_event_normalize', 'citation_indexing'],
    },
    node: {
      text: ['citation_footnote', 'callout'],
    },
  },
  [CopilotProviderType.CloudflareWorkersAi]: {
    rust: {
      request: ['normalize_messages'],
      stream: ['stream_event_normalize', 'citation_indexing'],
    },
    node: {
      text: ['citation_footnote', 'callout'],
    },
  },
  [CopilotProviderType.Anthropic]: {
    rust: {
      request: ['normalize_messages', 'tool_schema_rewrite'],
      stream: ['stream_event_normalize', 'citation_indexing'],
    },
    node: {
      text: ['citation_footnote', 'callout'],
    },
  },
  [CopilotProviderType.AnthropicVertex]: {
    rust: {
      request: ['normalize_messages', 'tool_schema_rewrite'],
      stream: ['stream_event_normalize', 'citation_indexing'],
    },
    node: {
      text: ['citation_footnote', 'callout'],
    },
  },
  [CopilotProviderType.Morph]: {
    rust: {
      request: ['clamp_max_tokens'],
      stream: ['stream_event_normalize', 'citation_indexing'],
    },
    node: {
      text: ['citation_footnote', 'callout'],
    },
  },
  [CopilotProviderType.Perplexity]: {
    rust: {
      request: ['clamp_max_tokens'],
      stream: ['stream_event_normalize', 'citation_indexing'],
    },
    node: {
      text: ['citation_footnote', 'callout'],
    },
  },
  [CopilotProviderType.Gemini]: {
    rust: {
      request: ['normalize_messages', 'tool_schema_rewrite'],
      stream: ['stream_event_normalize', 'citation_indexing'],
    },
    node: {
      text: ['citation_footnote', 'callout'],
    },
  },
  [CopilotProviderType.GeminiVertex]: {
    rust: {
      request: ['normalize_messages', 'tool_schema_rewrite'],
      stream: ['stream_event_normalize', 'citation_indexing'],
    },
    node: {
      text: ['citation_footnote', 'callout'],
    },
  },
  [CopilotProviderType.FAL]: {},
};

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function mergeArray<T>(base: T[] | undefined, override: T[] | undefined) {
  if (!base?.length && !override?.length) {
    return undefined;
  }
  return unique([...(base ?? []), ...(override ?? [])]);
}

export function mergeProviderMiddleware(
  defaults: ProviderMiddlewareConfig,
  override?: ProviderMiddlewareConfig
): ProviderMiddlewareConfig {
  return {
    rust: {
      request: mergeArray(defaults.rust?.request, override?.rust?.request),
      stream: mergeArray(defaults.rust?.stream, override?.rust?.stream),
    },
    node: {
      text: mergeArray(defaults.node?.text, override?.node?.text),
    },
  };
}

export function resolveProviderMiddleware(
  type: CopilotProviderType,
  override?: ProviderMiddlewareConfig
): ProviderMiddlewareConfig {
  const defaults = DEFAULT_MIDDLEWARE_BY_TYPE[type] ?? {};
  return mergeProviderMiddleware(defaults, override);
}
