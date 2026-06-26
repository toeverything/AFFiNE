import { ByokKeyStorage, ByokProvider } from '@affine/graphql';

export type AIProviderCapability =
  | 'Text'
  | 'Image input'
  | 'Actions'
  | 'Image generate'
  | 'Transcript'
  | 'Indexing';

export type AIModelDeploymentKind = 'server' | 'local';
export type AIExecutionLane = 'server' | 'local';
export type AIPrivacyState = 'cloud' | 'cloud_private' | 'local_private';
export type AppleLocalInferenceState = 'not_applicable' | 'deferred_candidate';

export interface PromptModelLike {
  id: string;
  name: string;
}

export interface PromptModelsResultLike {
  defaultModel: string;
  optionalModels: PromptModelLike[];
  proModels: PromptModelLike[];
}

export interface ByokWarningLike {
  featureKind: string;
  reason: string;
  requiredProviders?: ByokProvider[];
}

export interface ByokKeyLike {
  provider: ByokProvider;
  configured?: boolean;
  enabled?: boolean;
}

export interface ByokSettingsLike {
  allowedProviders: ByokProvider[];
  customEndpointSupported?: boolean;
  warnings?: ByokWarningLike[];
  keys?: ByokKeyLike[];
}

export interface AIProviderDescriptor {
  provider: ByokProvider;
  label: string;
  capabilities: AIProviderCapability[];
  executionLane: AIExecutionLane;
  privacyState: AIPrivacyState;
  localCapable: boolean;
  appleLocalInferenceState: AppleLocalInferenceState;
}

export interface AIModelCatalogItem {
  name: string;
  id: string;
  version: string;
  category: string;
  provider: ByokProvider | null;
  providerLabel: string | null;
  deploymentKind: AIModelDeploymentKind;
  executionLane: AIExecutionLane;
  privacyState: AIPrivacyState;
  localCapable: boolean;
  appleLocalInferenceState: AppleLocalInferenceState;
  isPro: boolean;
  isDefault: boolean;
}

export interface AIProviderAccessSummary extends AIProviderDescriptor {
  allowed: boolean;
  customEndpointSupported: boolean;
}

export interface AIModelCatalogSnapshot {
  selectedModelId?: string;
  defaultModelId?: string;
  selectedModel?: AIModelCatalogItem;
  defaultModel?: AIModelCatalogItem;
  models: AIModelCatalogItem[];
  providers: AIProviderAccessSummary[];
  warnings: Array<Required<ByokWarningLike>>;
}

const providerCatalog: Record<ByokProvider, AIProviderDescriptor> = {
  [ByokProvider.openai]: {
    provider: ByokProvider.openai,
    label: 'OpenAI',
    capabilities: ['Text', 'Image input', 'Actions', 'Image generate'],
    executionLane: 'server',
    privacyState: 'cloud',
    localCapable: false,
    appleLocalInferenceState: 'not_applicable',
  },
  [ByokProvider.anthropic]: {
    provider: ByokProvider.anthropic,
    label: 'Anthropic',
    capabilities: ['Text', 'Image input'],
    executionLane: 'server',
    privacyState: 'cloud',
    localCapable: false,
    appleLocalInferenceState: 'not_applicable',
  },
  [ByokProvider.gemini]: {
    provider: ByokProvider.gemini,
    label: 'Gemini',
    capabilities: [
      'Text',
      'Image input',
      'Actions',
      'Image generate',
      'Transcript',
      'Indexing',
    ],
    executionLane: 'server',
    privacyState: 'cloud',
    localCapable: false,
    appleLocalInferenceState: 'not_applicable',
  },
  [ByokProvider.fal]: {
    provider: ByokProvider.fal,
    label: 'FAL',
    capabilities: ['Image generate'],
    executionLane: 'server',
    privacyState: 'cloud',
    localCapable: false,
    appleLocalInferenceState: 'not_applicable',
  },
  [ByokProvider.glm]: {
    provider: ByokProvider.glm,
    label: 'GLM 5.2',
    capabilities: ['Text', 'Image input', 'Actions'],
    executionLane: 'server',
    privacyState: 'cloud',
    localCapable: false,
    appleLocalInferenceState: 'not_applicable',
  },
  [ByokProvider.gemma]: {
    provider: ByokProvider.gemma,
    label: 'Gemma',
    capabilities: ['Text', 'Image input'],
    executionLane: 'server',
    privacyState: 'cloud',
    localCapable: true,
    appleLocalInferenceState: 'deferred_candidate',
  },
};

export const providerLabels: Record<ByokProvider, string> = Object.fromEntries(
  Object.values(providerCatalog).map(descriptor => [
    descriptor.provider,
    descriptor.label,
  ])
) as Record<ByokProvider, string>;

export function getProviderDescriptor(
  provider: ByokProvider
): AIProviderDescriptor {
  return providerCatalog[provider];
}

export function executionLaneTitle(executionLane: AIExecutionLane): string {
  return executionLane === 'local' ? 'Local' : 'Cloud';
}

export function privacyStateTitle(privacyState: AIPrivacyState): string {
  switch (privacyState) {
    case 'cloud_private':
      return 'Cloud private';
    case 'local_private':
      return 'Local private';
    default:
      return 'Cloud';
  }
}

export function appleLocalInferenceStateTitle(
  state: AppleLocalInferenceState
): string {
  return state === 'deferred_candidate'
    ? 'Bundled local candidate'
    : 'Not applicable';
}

export function capabilitiesFor(
  provider: ByokProvider,
  storage: ByokKeyStorage
): AIProviderCapability[] {
  if (provider === ByokProvider.gemini && storage !== ByokKeyStorage.server) {
    return ['Text', 'Image input', 'Actions', 'Image generate'];
  }
  return providerCatalog[provider].capabilities;
}

export function inferProviderFromModel(
  modelId: string,
  modelName?: string
): ByokProvider | null {
  const candidate = `${modelId} ${modelName ?? ''}`.trim().toLowerCase();

  if (/\b(glm)([-\s]|$)/i.test(candidate)) {
    return ByokProvider.glm;
  }
  if (/\b(gemma)([-\s]|$)/i.test(candidate)) {
    return ByokProvider.gemma;
  }
  if (/\b(gemini)([-\s]|$)/i.test(candidate)) {
    return ByokProvider.gemini;
  }
  if (/\b(claude)([-\s]|$)/i.test(candidate)) {
    return ByokProvider.anthropic;
  }
  if (/\b(fal)([-\s]|$)/i.test(candidate)) {
    return ByokProvider.fal;
  }
  if (
    /\b(gpt|chatgpt|omni|o1|o3|o4|text-embedding|text-moderation)([-\s]|$)/i.test(
      candidate
    )
  ) {
    return ByokProvider.openai;
  }

  return null;
}

function splitModelName(name: string, fallbackId: string) {
  const normalizedName = name.trim() || fallbackId;
  const firstSpace = normalizedName.indexOf(' ');

  if (firstSpace === -1) {
    return {
      category: normalizedName,
      version: '',
    };
  }

  return {
    category: normalizedName.slice(0, firstSpace),
    version: normalizedName.slice(firstSpace + 1),
  };
}

function getConfiguredProviders(byokSettings?: ByokSettingsLike | null) {
  return new Set(
    (byokSettings?.keys ?? []).flatMap(key => {
      return key.configured && key.enabled !== false ? [key.provider] : [];
    })
  );
}

function privacyStateForProvider(
  provider: ByokProvider,
  configuredProviders: Set<ByokProvider>
): AIPrivacyState {
  const descriptor = providerCatalog[provider];
  if (descriptor.executionLane === 'local') {
    return 'local_private';
  }
  if (configuredProviders.has(provider)) {
    return 'cloud_private';
  }
  return descriptor.privacyState;
}

export function toAIModelCatalogItem(
  model: PromptModelLike,
  options: {
    defaultModelId?: string;
    proModelIds?: Set<string>;
    configuredProviders?: Set<ByokProvider>;
  } = {}
): AIModelCatalogItem {
  const provider = inferProviderFromModel(model.id, model.name);
  const { category, version } = splitModelName(model.name, model.id);
  const providerDescriptor = provider ? providerCatalog[provider] : null;

  return {
    name: model.name,
    id: model.id,
    version,
    category,
    provider,
    providerLabel: providerDescriptor?.label ?? null,
    deploymentKind: providerDescriptor?.executionLane ?? 'server',
    executionLane: providerDescriptor?.executionLane ?? 'server',
    privacyState:
      provider && options.configuredProviders
        ? privacyStateForProvider(provider, options.configuredProviders)
        : (providerDescriptor?.privacyState ?? 'cloud'),
    localCapable: providerDescriptor?.localCapable ?? false,
    appleLocalInferenceState:
      providerDescriptor?.appleLocalInferenceState ?? 'not_applicable',
    isPro: options.proModelIds?.has(model.id) ?? false,
    isDefault: model.id === options.defaultModelId,
  };
}

export function buildAIModelCatalogSnapshot(input: {
  selectedModelId?: string;
  promptModels?: PromptModelsResultLike | null;
  byokSettings?: ByokSettingsLike | null;
}): AIModelCatalogSnapshot {
  const defaultModelId = input.promptModels?.defaultModel;
  const proModelIds = new Set(
    input.promptModels?.proModels.map(model => model.id) ?? []
  );
  const configuredProviders = getConfiguredProviders(input.byokSettings);
  const models = (input.promptModels?.optionalModels ?? []).map(model =>
    toAIModelCatalogItem(model, {
      defaultModelId,
      proModelIds,
      configuredProviders,
    })
  );
  const selectedModelId = input.selectedModelId ?? defaultModelId;
  const allowedProviders = new Set(input.byokSettings?.allowedProviders ?? []);
  const customEndpointSupported =
    input.byokSettings?.customEndpointSupported ?? false;
  const warnings = (input.byokSettings?.warnings ?? []).map(warning => ({
    featureKind: warning.featureKind,
    reason: warning.reason,
    requiredProviders: warning.requiredProviders ?? [],
  }));

  const providers = Object.values(providerCatalog).map(descriptor => ({
    ...descriptor,
    privacyState: privacyStateForProvider(
      descriptor.provider,
      configuredProviders
    ),
    allowed:
      allowedProviders.size === 0 || allowedProviders.has(descriptor.provider),
    customEndpointSupported,
  }));

  return {
    selectedModelId,
    defaultModelId,
    selectedModel: models.find(model => model.id === selectedModelId),
    defaultModel: models.find(model => model.id === defaultModelId),
    models,
    providers,
    warnings,
  };
}

export const DESKTOP_OFFLINE_GEMMA_MODEL_ID = 'gemma-3-4b-it';

export function buildDesktopOfflineGemmaModels(): AIModelCatalogItem[] {
  return [
    toAIModelCatalogItem(
      {
        id: DESKTOP_OFFLINE_GEMMA_MODEL_ID,
        name: 'Gemma 3 4B Instruct',
      },
      { defaultModelId: DESKTOP_OFFLINE_GEMMA_MODEL_ID }
    ),
  ];
}

export function mergeDesktopLocalGemmaModels(
  models: AIModelCatalogItem[]
): AIModelCatalogItem[] {
  const hasCloudModels = models.length > 0;
  const desktopModels = buildDesktopOfflineGemmaModels().map(model => ({
    ...model,
    isDefault: !hasCloudModels && model.isDefault,
  }));
  const merged = [...desktopModels];

  for (const model of models) {
    if (!merged.some(existing => existing.id === model.id)) {
      merged.push(model);
    }
  }

  return merged;
}
