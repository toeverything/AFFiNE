import {
  ByokCustomEndpointMode,
  ByokModelFeature,
  ByokModelInput,
  ByokModelOutput,
  ByokProvider,
} from '@affine/graphql';
import type { I18nInstance } from '@affine/i18n';

import { type ByokKey, ByokStorage } from './types';

export function byokT(
  t: I18nInstance,
  key: string,
  options?: Record<string, unknown>
) {
  return t.t('com.affine.settings.workspace.byok.' + key, options);
}

export const providerLabels: Record<ByokProvider, string> = {
  [ByokProvider.openai]: 'OpenAI',
  [ByokProvider.anthropic]: 'Anthropic',
  [ByokProvider.gemini]: 'Gemini',
  [ByokProvider.fal]: 'FAL',
};

export function storageLabel(t: I18nInstance, storage: ByokStorage) {
  return storage === ByokStorage.local
    ? byokT(t, 'storage.local')
    : byokT(t, 'storage.server');
}

export function endpointHintKey(
  mode: ByokCustomEndpointMode,
  privateEndpointSupported: boolean
) {
  if (mode === ByokCustomEndpointMode.disabled) {
    return 'endpoint.custom-disabled';
  }
  if (!privateEndpointSupported) {
    return 'endpoint.private-disabled';
  }
  return null;
}

export function capabilitiesFor(key: Pick<ByokKey, 'definition'>) {
  const capabilities = key.definition.models.flatMap(model =>
    model.enabled ? model.capabilities : []
  );
  const labels = new Set<string>();
  for (const capability of capabilities) {
    if (capability.output.includes(ByokModelOutput.text)) labels.add('Text');
    if (capability.input.includes(ByokModelInput.image))
      labels.add('Image input');
    if (capability.output.includes(ByokModelOutput.image))
      labels.add('Image generate');
    if (capability.features.includes(ByokModelFeature.tool_calling))
      labels.add('Actions');
    if (capability.input.includes(ByokModelInput.audio))
      labels.add('Transcript');
    if (capability.output.includes(ByokModelOutput.embedding))
      labels.add('Indexing');
  }
  return [...labels];
}

export function capabilityLabel(t: I18nInstance, capability: string) {
  switch (capability) {
    case 'Text':
      return byokT(t, 'capability.text');
    case 'Image input':
      return byokT(t, 'capability.image-input');
    case 'Actions':
      return byokT(t, 'capability.actions');
    case 'Image generate':
      return byokT(t, 'capability.image-generate');
    case 'Transcript':
      return byokT(t, 'capability.transcript');
    case 'Indexing':
      return byokT(t, 'capability.indexing');
    default:
      return capability;
  }
}

export const capabilityRows = [
  {
    titleKey: 'feature.chat.title',
    featureKind: 'chat',
    fallbackKey: 'feature.chat.fallback',
    icon: 'chat',
    providers: [
      ByokProvider.openai,
      ByokProvider.anthropic,
      ByokProvider.gemini,
    ],
    coverageCapabilities: ['Text'],
  },
  {
    titleKey: 'feature.action.title',
    featureKind: 'action',
    fallbackKey: 'feature.action.fallback',
    icon: 'action',
    providers: [ByokProvider.openai, ByokProvider.gemini],
    coverageCapabilities: ['Actions'],
  },
  {
    titleKey: 'feature.image.title',
    featureKind: 'image',
    fallbackKey: 'feature.image.fallback',
    icon: 'image',
    providers: [ByokProvider.openai, ByokProvider.gemini, ByokProvider.fal],
    coverageCapabilities: ['Image generate'],
  },
  {
    titleKey: 'feature.transcript.title',
    featureKind: 'transcript',
    fallbackKey: 'feature.transcript.fallback',
    icon: 'transcript',
    providers: [ByokProvider.gemini],
    coverageCapabilities: ['Transcript'],
    storage: ByokStorage.server,
  },
  {
    titleKey: 'feature.workspace-indexing.title',
    featureKind: 'workspace_indexing',
    fallbackKey: 'feature.workspace-indexing.fallback',
    icon: 'indexing',
    providers: [ByokProvider.gemini],
    coverageCapabilities: ['Indexing'],
    storage: ByokStorage.server,
  },
] as const;

function formatDate(value?: string | null) {
  if (!value) {
    return null;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function rowDescription(t: I18nInstance, key: ByokKey) {
  const tested = formatDate(key.validation?.connection.testedAt);
  const activity =
    key.validation?.connection.kind === 'failed'
      ? byokT(t, 'row.activity.failed', { date: tested ?? '' })
      : key.validation?.connection.kind === 'verified'
        ? byokT(t, 'status.key-verified')
        : byokT(t, 'row.activity.unused');

  return [storageLabel(t, key.storage), activity, key.description]
    .filter(Boolean)
    .join(' • ');
}

export function warningDescription(
  t: I18nInstance,
  warning?: { featureKind: string; reason: string }
) {
  if (!warning) {
    return null;
  }
  switch (warning.featureKind) {
    case 'transcript':
      return byokT(t, 'warning.transcript');
    case 'workspace_indexing':
      return byokT(t, 'warning.workspace-indexing');
    default:
      return warning.reason;
  }
}
