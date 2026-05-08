import { ByokKeyStorage, ByokProvider } from '@affine/graphql';
import type { I18nInstance } from '@affine/i18n';

import type { ByokKey, ByokStorage } from './types';

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
  return storage === ByokKeyStorage.local
    ? byokT(t, 'storage.local')
    : byokT(t, 'storage.server');
}

export function capabilitiesFor(provider: ByokProvider, storage: ByokStorage) {
  switch (provider) {
    case ByokProvider.openai:
      return ['Text', 'Image input', 'Actions', 'Image generate'];
    case ByokProvider.anthropic:
      return ['Text', 'Image input'];
    case ByokProvider.gemini:
      return storage === ByokKeyStorage.server
        ? [
            'Text',
            'Image input',
            'Actions',
            'Image generate',
            'Transcript',
            'Indexing',
          ]
        : ['Text', 'Image input', 'Actions', 'Image generate'];
    case ByokProvider.fal:
      return ['Image generate'];
  }
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
    storage: ByokKeyStorage.server,
  },
  {
    titleKey: 'feature.workspace-indexing.title',
    featureKind: 'workspace_indexing',
    fallbackKey: 'feature.workspace-indexing.fallback',
    icon: 'indexing',
    providers: [ByokProvider.gemini],
    coverageCapabilities: ['Indexing'],
    storage: ByokKeyStorage.server,
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
  const failed = formatDate(key.lastErrorAt);
  const used = formatDate(key.lastUsedAt);
  const today = formatDate(new Date().toISOString());
  const activity = failed
    ? byokT(t, 'row.activity.failed', { date: failed })
    : used
      ? used === today
        ? byokT(t, 'row.activity.used-today')
        : byokT(t, 'row.activity.used', { date: used })
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
