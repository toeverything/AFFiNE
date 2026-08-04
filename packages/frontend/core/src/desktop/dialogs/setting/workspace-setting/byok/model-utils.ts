import type { ByokProvider } from '@affine/graphql';

import type { ByokDefinition, ByokSettings } from './types';

export type ModelDeclaration = ByokDefinition['models'][number];
type Capability = ModelDeclaration['capabilities'][number];
export type UseCase =
  | 'chat'
  | 'actions'
  | 'structured'
  | 'vision'
  | 'image'
  | 'transcript'
  | 'embedding'
  | 'rerank';

export const useCases: { id: UseCase; labelKey: string }[] = [
  { id: 'chat', labelKey: 'model.use.chat' },
  { id: 'actions', labelKey: 'model.use.actions' },
  { id: 'structured', labelKey: 'model.use.structured' },
  { id: 'vision', labelKey: 'model.use.vision' },
  { id: 'image', labelKey: 'model.use.image' },
  { id: 'transcript', labelKey: 'model.use.transcript' },
  { id: 'embedding', labelKey: 'model.use.embedding' },
  { id: 'rerank', labelKey: 'model.use.rerank' },
];

export function capabilityForUseCase(useCase: UseCase): Capability {
  switch (useCase) {
    case 'actions':
      return modelCapability(['text'], ['text'], ['tools']);
    case 'structured':
      return modelCapability(['text'], ['structured']);
    case 'vision':
      return modelCapability(
        ['text', 'image'],
        ['text'],
        [],
        ['image'],
        ['url', 'data', 'bytes', 'file_handle']
      );
    case 'image':
      return modelCapability(['text'], ['image']);
    case 'transcript':
      return modelCapability(
        ['audio'],
        ['structured'],
        [],
        ['audio'],
        ['url', 'data', 'bytes', 'file_handle']
      );
    case 'embedding':
      return modelCapability(['text'], ['embedding']);
    case 'rerank':
      return modelCapability(['text'], ['rerank']);
    default:
      return modelCapability(['text'], ['text']);
  }
}

function modelCapability(
  input: string[],
  output: string[],
  features: string[] = [],
  attachmentKinds: string[] = [],
  attachmentSources: string[] = []
): Capability {
  return { input, output, features, attachmentKinds, attachmentSources };
}

function matchesCapability(value: Capability, useCase: UseCase) {
  const expected = capabilityForUseCase(useCase);
  const fields = [
    'input',
    'output',
    'features',
    'attachmentKinds',
    'attachmentSources',
  ] as const;
  return fields.every(
    field =>
      value[field].length === expected[field].length &&
      value[field].every((item, index) => item === expected[field][index])
  );
}

export function modelUseCases(model: ModelDeclaration) {
  return useCases
    .filter(({ id }) =>
      model.capabilities.some(item => matchesCapability(item, id))
    )
    .map(({ id }) => id);
}

export function probeChecks(models: ModelDeclaration[], includeImage: boolean) {
  return models
    .filter(model => model.enabled)
    .flatMap(model =>
      modelUseCases(model)
        .filter(
          useCase =>
            !['vision', 'transcript'].includes(useCase) &&
            (useCase !== 'image' || includeImage)
        )
        .map(useCase => ({
          modelId: model.modelId,
          operation: useCase === 'actions' ? 'tools' : useCase,
        }))
    );
}

export function catalogModels(settings: ByokSettings, provider: ByokProvider) {
  return (
    settings.catalog.providers.find(item => item.provider === provider)
      ?.models ?? []
  );
}

export function defaultModels(settings: ByokSettings, provider: ByokProvider) {
  const catalog = catalogModels(settings, provider);
  const selected = catalog.filter(model => model.recommended);
  return (selected.length ? selected : catalog.slice(0, 1)).map(model => ({
    modelId: model.modelId,
    enabled: true,
    capabilities: model.capabilities,
  }));
}
