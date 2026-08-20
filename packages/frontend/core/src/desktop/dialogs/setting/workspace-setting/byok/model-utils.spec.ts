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
});
