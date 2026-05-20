import type { ProviderMiddlewareConfig } from '../config';
import { CopilotProviderType } from './types';

const DEFAULT_NODE_TEXT_MIDDLEWARE: NonNullable<
  NonNullable<ProviderMiddlewareConfig['node']>['text']
> = ['citation_footnote', 'callout'];

const DEFAULT_MIDDLEWARE_BY_TYPE: Record<
  CopilotProviderType,
  ProviderMiddlewareConfig
> = {
  [CopilotProviderType.OpenAI]: {
    node: { text: DEFAULT_NODE_TEXT_MIDDLEWARE },
  },
  [CopilotProviderType.CloudflareWorkersAi]: {
    node: { text: DEFAULT_NODE_TEXT_MIDDLEWARE },
  },
  [CopilotProviderType.Anthropic]: {
    node: { text: DEFAULT_NODE_TEXT_MIDDLEWARE },
  },
  [CopilotProviderType.AnthropicVertex]: {
    node: { text: DEFAULT_NODE_TEXT_MIDDLEWARE },
  },
  [CopilotProviderType.Gemini]: {
    node: { text: DEFAULT_NODE_TEXT_MIDDLEWARE },
  },
  [CopilotProviderType.GeminiVertex]: {
    node: { text: DEFAULT_NODE_TEXT_MIDDLEWARE },
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

function compactMiddlewareSection<T extends Record<string, unknown>>(
  section: T
): T | undefined {
  return Object.values(section).some(value => value !== undefined)
    ? section
    : undefined;
}

export function mergeProviderMiddleware(
  defaults: ProviderMiddlewareConfig,
  override?: ProviderMiddlewareConfig
): ProviderMiddlewareConfig {
  return {
    rust: compactMiddlewareSection({
      request: mergeArray(defaults.rust?.request, override?.rust?.request),
      stream: mergeArray(defaults.rust?.stream, override?.rust?.stream),
    }),
    node: compactMiddlewareSection({
      text: mergeArray(defaults.node?.text, override?.node?.text),
    }),
  };
}

export function resolveProviderMiddleware(
  type: CopilotProviderType,
  override?: ProviderMiddlewareConfig
): ProviderMiddlewareConfig {
  const defaults = DEFAULT_MIDDLEWARE_BY_TYPE[type] ?? {};
  return mergeProviderMiddleware(defaults, override);
}
