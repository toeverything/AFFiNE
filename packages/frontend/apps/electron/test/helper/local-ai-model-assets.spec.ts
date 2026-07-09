import path from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  LOCAL_AI_MODEL_FILENAME,
  resolveLocalAIAssets,
} from '../../src/helper/local-ai/model-assets';
import { buildSidecarArgs } from '../../src/helper/local-ai/sidecar';

describe('local AI asset helpers', () => {
  test('resolve packaged and downloaded asset paths plus sidecar args', () => {
    const resourcesRoot = path.join(
      path.sep,
      'Applications',
      'AFFiNE.app',
      'Contents',
      'Resources'
    );
    const userDataPath = path.join(
      path.sep,
      'Users',
      'demo',
      'Library',
      'Application Support',
      'AFFiNE'
    );

    expect(resolveLocalAIAssets(resourcesRoot, userDataPath)).toEqual({
      binaryPath: path.join(resourcesRoot, 'local-ai', 'bin', 'llama-server'),
      bundledModelPath: path.join(
        resourcesRoot,
        'local-ai',
        'models',
        LOCAL_AI_MODEL_FILENAME
      ),
      downloadedModelPath: path.join(
        userDataPath,
        'local-ai',
        'models',
        LOCAL_AI_MODEL_FILENAME
      ),
      modelDirectory: path.join(userDataPath, 'local-ai', 'models'),
      dylibPaths: [
        'libllama-server-impl.dylib',
        'libllama-common.0.dylib',
        'libmtmd.0.dylib',
        'libllama.0.dylib',
        'libggml.0.dylib',
        'libggml-base.0.dylib',
        'libssl.3.dylib',
        'libcrypto.3.dylib',
        'libomp.dylib',
      ].map(fileName => path.join(resourcesRoot, 'local-ai', 'lib', fileName)),
      backendPluginPaths: [
        'libggml-blas.so',
        'libggml-cpu-apple_m1.so',
        'libggml-cpu-apple_m2_m3.so',
        'libggml-cpu-apple_m4.so',
        'libggml-metal.so',
      ].map(fileName => path.join(resourcesRoot, 'local-ai', 'bin', fileName)),
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
      '--no-warmup',
    ]);
  });
});
