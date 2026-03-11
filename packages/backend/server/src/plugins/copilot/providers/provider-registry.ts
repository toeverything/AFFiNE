import type {
  CopilotProviderConfigMap,
  CopilotProviderDefaults,
  CopilotProviderProfile,
  ProviderMiddlewareConfig,
} from '../config';
import { resolveProviderMiddleware } from './provider-middleware';
import { CopilotProviderType, ModelOutputType } from './types';

const PROVIDER_ID_PATTERN = /^[a-zA-Z0-9-_]+$/;

const LEGACY_PROVIDER_ORDER: CopilotProviderType[] = [
  CopilotProviderType.OpenAI,
  CopilotProviderType.FAL,
  CopilotProviderType.Gemini,
  CopilotProviderType.GeminiVertex,
  CopilotProviderType.Perplexity,
  CopilotProviderType.Anthropic,
  CopilotProviderType.AnthropicVertex,
  CopilotProviderType.Morph,
];

const LEGACY_PROVIDER_PRIORITY = LEGACY_PROVIDER_ORDER.reduce(
  (acc, type, index) => {
    acc[type] = LEGACY_PROVIDER_ORDER.length - index;
    return acc;
  },
  {} as Record<CopilotProviderType, number>
);

type LegacyProvidersConfig = Partial<
  Record<CopilotProviderType, CopilotProviderConfigMap[CopilotProviderType]>
>;

export type CopilotProvidersConfigInput = LegacyProvidersConfig & {
  profiles?: CopilotProviderProfile[] | null;
  defaults?: CopilotProviderDefaults | null;
};

export type NormalizedCopilotProviderProfile = Omit<
  CopilotProviderProfile,
  'enabled' | 'priority' | 'middleware'
> & {
  enabled: boolean;
  priority: number;
  middleware: ProviderMiddlewareConfig;
};

export type CopilotProviderRegistry = {
  profiles: Map<string, NormalizedCopilotProviderProfile>;
  defaults: CopilotProviderDefaults;
  order: string[];
  byType: Map<CopilotProviderType, string[]>;
};

export type ResolveModelResult = {
  rawModelId?: string;
  modelId?: string;
  explicitProviderId?: string;
  candidateProviderIds: string[];
};

type ResolveModelOptions = {
  registry: CopilotProviderRegistry;
  modelId?: string;
  outputType?: ModelOutputType;
  availableProviderIds?: Iterable<string>;
  preferredProviderIds?: Iterable<string>;
};

function unique<T>(list: T[]): T[] {
  return [...new Set(list)];
}

function asArray<T>(iter?: Iterable<T>): T[] {
  return iter ? Array.from(iter) : [];
}

function parseModelPrefix(
  registry: CopilotProviderRegistry,
  modelId: string
): { providerId: string; modelId?: string } | null {
  const index = modelId.indexOf('/');
  if (index <= 0) {
    return null;
  }

  const providerId = modelId.slice(0, index);
  if (!registry.profiles.has(providerId)) {
    return null;
  }

  const model = modelId.slice(index + 1);
  return { providerId, modelId: model || undefined };
}

function normalizeProfile(
  profile: CopilotProviderProfile
): NormalizedCopilotProviderProfile {
  return {
    ...profile,
    enabled: profile.enabled !== false,
    priority: profile.priority ?? 0,
    middleware: resolveProviderMiddleware(profile.type, profile.middleware),
  };
}

function toLegacyProfiles(
  config: CopilotProvidersConfigInput
): CopilotProviderProfile[] {
  const legacyProfiles: CopilotProviderProfile[] = [];
  for (const type of LEGACY_PROVIDER_ORDER) {
    const legacyConfig = config[type];
    if (!legacyConfig) {
      continue;
    }
    legacyProfiles.push({
      id: `${type}-default`,
      type,
      priority: LEGACY_PROVIDER_PRIORITY[type],
      config: legacyConfig,
    } as CopilotProviderProfile);
  }
  return legacyProfiles;
}

function mergeProfiles(
  explicitProfiles: CopilotProviderProfile[],
  legacyProfiles: CopilotProviderProfile[]
): CopilotProviderProfile[] {
  const profiles = new Map<string, CopilotProviderProfile>();

  for (const profile of explicitProfiles) {
    if (!PROVIDER_ID_PATTERN.test(profile.id)) {
      throw new Error(`Invalid copilot provider profile id: ${profile.id}`);
    }
    if (profiles.has(profile.id)) {
      throw new Error(`Duplicated copilot provider profile id: ${profile.id}`);
    }
    profiles.set(profile.id, profile);
  }

  for (const profile of legacyProfiles) {
    if (!profiles.has(profile.id)) {
      profiles.set(profile.id, profile);
    }
  }

  return Array.from(profiles.values());
}

function sortProfiles(profiles: NormalizedCopilotProviderProfile[]) {
  return profiles.toSorted((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return a.id.localeCompare(b.id);
  });
}

function assertDefaults(
  defaults: CopilotProviderDefaults,
  profiles: Map<string, NormalizedCopilotProviderProfile>
) {
  for (const providerId of Object.values(defaults)) {
    if (!providerId) {
      continue;
    }
    if (!profiles.has(providerId)) {
      throw new Error(
        `Copilot provider defaults references unknown providerId: ${providerId}`
      );
    }
  }
}

export function buildProviderRegistry(
  config: CopilotProvidersConfigInput
): CopilotProviderRegistry {
  const explicitProfiles = config.profiles ?? [];
  const legacyProfiles = toLegacyProfiles(config);
  const mergedProfiles = mergeProfiles(explicitProfiles, legacyProfiles)
    .map(normalizeProfile)
    .filter(profile => profile.enabled);
  const sortedProfiles = sortProfiles(mergedProfiles);

  const profiles = new Map(
    sortedProfiles.map(profile => [profile.id, profile] as const)
  );
  const defaults = config.defaults ?? {};
  assertDefaults(defaults, profiles);

  const order = sortedProfiles.map(profile => profile.id);
  const byType = new Map<CopilotProviderType, string[]>();
  for (const profile of sortedProfiles) {
    const ids = byType.get(profile.type) ?? [];
    ids.push(profile.id);
    byType.set(profile.type, ids);
  }

  return { profiles, defaults, order, byType };
}

export function resolveModel({
  registry,
  modelId,
  outputType,
  availableProviderIds,
  preferredProviderIds,
}: ResolveModelOptions): ResolveModelResult {
  const available = new Set(asArray(availableProviderIds));
  const preferred = new Set(asArray(preferredProviderIds));
  const hasAvailableFilter = available.size > 0;
  const hasPreferredFilter = preferred.size > 0;

  const isAllowed = (providerId: string) => {
    const profile = registry.profiles.get(providerId);
    if (!profile?.enabled) {
      return false;
    }
    if (hasAvailableFilter && !available.has(providerId)) {
      return false;
    }
    if (hasPreferredFilter && !preferred.has(providerId)) {
      return false;
    }
    return true;
  };

  const prefixed = modelId ? parseModelPrefix(registry, modelId) : null;
  if (prefixed) {
    return {
      rawModelId: modelId,
      modelId: prefixed.modelId,
      explicitProviderId: prefixed.providerId,
      candidateProviderIds: isAllowed(prefixed.providerId)
        ? [prefixed.providerId]
        : [],
    };
  }

  const defaultProviderId =
    outputType && outputType !== ModelOutputType.Rerank
      ? registry.defaults[outputType]
      : undefined;

  const fallbackOrder = [
    ...(defaultProviderId ? [defaultProviderId] : []),
    registry.defaults.fallback,
    ...registry.order,
  ].filter((id): id is string => !!id);

  return {
    rawModelId: modelId,
    modelId,
    candidateProviderIds: unique(
      fallbackOrder.filter(providerId => isAllowed(providerId))
    ),
  };
}

export function stripProviderPrefix(
  registry: CopilotProviderRegistry,
  providerId: string,
  modelId?: string
) {
  if (!modelId) {
    return modelId;
  }
  const prefixed = parseModelPrefix(registry, modelId);
  if (!prefixed) {
    return modelId;
  }
  if (prefixed.providerId !== providerId) {
    return modelId;
  }
  return prefixed.modelId;
}
