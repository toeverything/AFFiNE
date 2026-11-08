import {
  ByokAttachmentKind,
  ByokAttachmentSource,
  ByokModelFeature,
  ByokModelInput,
  ByokModelOutput,
} from '@affine/graphql';
import { describe, expect, test } from 'vitest';

import {
  capabilitiesForUseCases,
  type ModelDeclaration,
  modelUseCases,
  retainVerifiedCapabilities,
} from './model-utils';

describe('BYOK model capabilities', () => {
  test('maps richer catalog capabilities by minimum requirements', () => {
    const model: ModelDeclaration = {
      modelId: 'multimodal-tools',
      enabled: true,
      capabilities: [
        {
          input: [ByokModelInput.text, ByokModelInput.image],
          output: [ByokModelOutput.text],
          features: [ByokModelFeature.tool_calling],
          attachmentKinds: [ByokAttachmentKind.image],
          attachmentSources: [
            ByokAttachmentSource.url,
            ByokAttachmentSource.data,
            ByokAttachmentSource.bytes,
            ByokAttachmentSource.file_handle,
          ],
        },
      ],
    };

    expect(modelUseCases(model)).toEqual(['chat', 'actions', 'vision']);
  });

  test('preserves a rich capability when its represented uses stay selected', () => {
    const capability = {
      input: [ByokModelInput.text, ByokModelInput.image],
      output: [ByokModelOutput.text],
      features: [ByokModelFeature.tool_calling],
      attachmentKinds: [ByokAttachmentKind.image],
      attachmentSources: [
        ByokAttachmentSource.url,
        ByokAttachmentSource.data,
        ByokAttachmentSource.bytes,
        ByokAttachmentSource.file_handle,
      ],
    };
    const model: ModelDeclaration = {
      modelId: 'multimodal-tools',
      enabled: true,
      capabilities: [capability],
    };

    expect(
      capabilitiesForUseCases(model, ['chat', 'actions', 'vision'])
    ).toEqual([capability]);
  });

  test('drops capabilities that imply failed uses while keeping independent uses', () => {
    const embeddingCapability = {
      input: [ByokModelInput.text],
      output: [ByokModelOutput.embedding],
      features: [],
      attachmentKinds: [],
      attachmentSources: [],
    };
    const model: ModelDeclaration = {
      modelId: 'multimodal-tools',
      enabled: true,
      capabilities: [
        {
          input: [ByokModelInput.text, ByokModelInput.image],
          output: [ByokModelOutput.text],
          features: [ByokModelFeature.tool_calling],
          attachmentKinds: [ByokAttachmentKind.image],
          attachmentSources: [
            ByokAttachmentSource.url,
            ByokAttachmentSource.data,
            ByokAttachmentSource.bytes,
            ByokAttachmentSource.file_handle,
          ],
        },
        embeddingCapability,
      ],
    };

    const retained = retainVerifiedCapabilities(
      [model],
      [
        {
          modelId: model.modelId,
          checks: [
            { operation: 'chat', status: { kind: 'failed' } },
            { operation: 'tool_calling', status: { kind: 'verified' } },
            { operation: 'embedding', status: { kind: 'verified' } },
          ],
        },
      ]
    )[0];

    expect(retained).toEqual({
      ...model,
      capabilities: [embeddingCapability],
    });
    expect(modelUseCases(retained)).toEqual(['embedding']);
  });
});
