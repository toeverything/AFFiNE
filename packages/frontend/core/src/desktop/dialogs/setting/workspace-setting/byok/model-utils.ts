import {
  ByokAttachmentKind,
  ByokAttachmentSource,
  ByokModelFeature,
  ByokModelInput,
  ByokModelOutput,
  ByokProbeOperation,
  type ByokProvider,
} from '@affine/graphql';

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
      return modelCapability(
        [ByokModelInput.text],
        [ByokModelOutput.text],
        [ByokModelFeature.tool_calling]
      );
    case 'structured':
      return modelCapability(
        [ByokModelInput.text],
        [ByokModelOutput.structured]
      );
    case 'vision':
      return modelCapability(
        [ByokModelInput.text, ByokModelInput.image],
        [ByokModelOutput.text],
        [],
        [ByokAttachmentKind.image],
        [
          ByokAttachmentSource.url,
          ByokAttachmentSource.data,
          ByokAttachmentSource.bytes,
          ByokAttachmentSource.file_handle,
        ]
      );
    case 'image':
      return modelCapability([ByokModelInput.text], [ByokModelOutput.image]);
    case 'transcript':
      return modelCapability(
        [ByokModelInput.audio],
        [ByokModelOutput.structured],
        [],
        [ByokAttachmentKind.audio],
        [
          ByokAttachmentSource.url,
          ByokAttachmentSource.data,
          ByokAttachmentSource.bytes,
          ByokAttachmentSource.file_handle,
        ]
      );
    case 'embedding':
      return modelCapability(
        [ByokModelInput.text],
        [ByokModelOutput.embedding]
      );
    case 'rerank':
      return modelCapability([ByokModelInput.text], [ByokModelOutput.rerank]);
    default:
      return modelCapability([ByokModelInput.text], [ByokModelOutput.text]);
  }
}

function modelCapability(
  input: ByokModelInput[],
  output: ByokModelOutput[],
  features: ByokModelFeature[] = [],
  attachmentKinds: ByokAttachmentKind[] = [],
  attachmentSources: ByokAttachmentSource[] = []
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
  return fields.every(field =>
    expected[field].every(item => new Set<string>(value[field]).has(item))
  );
}

export function modelUseCases(model: ModelDeclaration) {
  return useCases
    .filter(({ id }) =>
      model.capabilities.some(item => matchesCapability(item, id))
    )
    .map(({ id }) => id);
}

export function capabilitiesForUseCases(
  model: ModelDeclaration | null,
  selectedUseCases: UseCase[]
) {
  const selected = new Set(selectedUseCases);
  const capabilities = (model?.capabilities ?? []).filter(capability => {
    const represented = useCases
      .map(({ id }) => id)
      .filter(useCase => matchesCapability(capability, useCase));
    return (
      represented.length > 0 &&
      represented.every(useCase => selected.has(useCase))
    );
  });

  for (const useCase of selectedUseCases) {
    if (
      !capabilities.some(capability => matchesCapability(capability, useCase))
    ) {
      capabilities.push(capabilityForUseCase(useCase));
    }
  }
  return capabilities;
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
          operation:
            useCase === 'actions'
              ? ByokProbeOperation.tool_calling
              : ByokProbeOperation[useCase],
        }))
    );
}

export function retainVerifiedCapabilities(
  models: ModelDeclaration[],
  probeModels: Array<{
    modelId: string;
    checks: Array<{ operation: string; status: { kind: string } }>;
  }>
) {
  return models.map(model => {
    const probe = probeModels.find(item => item.modelId === model.modelId);
    if (!probe) return model;
    const failedOperations = new Set(
      probe.checks
        .filter(check => check.status.kind !== 'verified')
        .map(check => check.operation)
    );
    const selectedUseCases = modelUseCases(model);
    const verifiedUseCases = selectedUseCases.filter(useCase => {
      const operation = useCase === 'actions' ? 'tool_calling' : useCase;
      if (failedOperations.has(operation)) return false;

      const represented = modelUseCases({
        ...model,
        capabilities: [capabilityForUseCase(useCase)],
      });
      return represented.every(
        representedUseCase =>
          !failedOperations.has(
            representedUseCase === 'actions'
              ? 'tool_calling'
              : representedUseCase
          )
      );
    });
    const rebuiltCapabilities =
      selectedUseCases.length > 0 &&
      verifiedUseCases.length === selectedUseCases.length
        ? model.capabilities
        : verifiedUseCases.map(capabilityForUseCase);
    const capabilities = rebuiltCapabilities.length
      ? rebuiltCapabilities
      : model.capabilities;
    return {
      ...model,
      enabled: rebuiltCapabilities.length > 0 && model.enabled,
      capabilities,
    };
  });
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
