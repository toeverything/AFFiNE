import { describe, expect, test } from 'vitest';

import {
  LOCAL_AI_MODEL_FILENAME,
  resolveLocalAIAssets,
} from '../../src/helper/local-ai/model-assets';
import { buildSidecarArgs } from '../../src/helper/local-ai/sidecar';

describe('local AI asset helpers', () => {
  test('resolve packaged and downloaded asset paths plus sidecar args', () => {
    expect(
      resolveLocalAIAssets(
        '/Applications/AFFiNE.app/Contents/Resources',
        '/Users/demo/Library/Application Support/AFFiNE'
      )
    ).toEqual({
      binaryPath:
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/bin/llama-server',
      bundledModelPath: `/Applications/AFFiNE.app/Contents/Resources/local-ai/models/${LOCAL_AI_MODEL_FILENAME}`,
      downloadedModelPath: `/Users/demo/Library/Application Support/AFFiNE/local-ai/models/${LOCAL_AI_MODEL_FILENAME}`,
      modelDirectory:
        '/Users/demo/Library/Application Support/AFFiNE/local-ai/models',
      dylibPaths: [
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/lib/libllama-server-impl.dylib',
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/lib/libllama-common.0.dylib',
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/lib/libmtmd.0.dylib',
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/lib/libllama.0.dylib',
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/lib/libggml.0.dylib',
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/lib/libggml-base.0.dylib',
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/lib/libssl.3.dylib',
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/lib/libcrypto.3.dylib',
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/lib/libomp.dylib',
      ],
      backendPluginPaths: [
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/bin/libggml-blas.so',
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/bin/libggml-cpu-apple_m1.so',
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/bin/libggml-cpu-apple_m2_m3.so',
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/bin/libggml-cpu-apple_m4.so',
        '/Applications/AFFiNE.app/Contents/Resources/local-ai/bin/libggml-metal.so',
      ],
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
      '0',
      '--device',
      'none',
      '--no-warmup',
    ]);
  });
});
