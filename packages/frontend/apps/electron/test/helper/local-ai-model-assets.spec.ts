import { describe, expect, test } from 'vitest';

import { resolveLocalAIAssets } from '../../src/helper/local-ai/model-assets';
import { buildSidecarArgs } from '../../src/helper/local-ai/sidecar';

describe('local AI asset helpers', () => {
  test('resolve packaged asset paths and sidecar args', () => {
    expect(
      resolveLocalAIAssets('/Applications/AFFiNE.app/Contents/Resources')
    ).toEqual({
      binaryPath:
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/bin/llama-server',
      modelPath:
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/models/gemma-3-4b-it.gguf',
    });

    expect(
      buildSidecarArgs({
        modelPath: '/tmp/gemma-3-4b-it.gguf',
        port: 43111,
      })
    ).toEqual([
      '--model',
      '/tmp/gemma-3-4b-it.gguf',
      '--host',
      '127.0.0.1',
      '--port',
      '43111',
      '--ctx-size',
      '8192',
      '--n-gpu-layers',
      '99',
    ]);
  });
});
