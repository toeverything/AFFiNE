import { describe, expect, test } from 'vitest';

import {
  capabilitiesForUseCases,
  modelUseCases,
  type ModelDeclaration,
} from './model-utils';

describe('BYOK model capabilities', () => {
  test('maps richer catalog capabilities by minimum requirements', () => {
    const model: ModelDeclaration = {
      modelId: 'multimodal-tools',
      enabled: true,
      capabilities: [
        {
          input: ['text', 'image'],
          output: ['text'],
          features: ['tools'],
          attachmentKinds: ['image'],
          attachmentSources: ['url', 'data', 'bytes', 'file_handle'],
        },
      ],
    };

    expect(modelUseCases(model)).toEqual(['chat', 'actions', 'vision']);
  });

  test('preserves a rich capability when its represented uses stay selected', () => {
    const capability = {
      input: ['text', 'image'],
      output: ['text'],
      features: ['tools'],
      attachmentKinds: ['image'],
      attachmentSources: ['url', 'data', 'bytes', 'file_handle'],
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
