import path from 'node:path';

export const LOCAL_AI_RUNTIME_LIBRARIES = [
  'libllama-server-impl.dylib',
  'libllama-common.0.dylib',
  'libmtmd.0.dylib',
  'libllama.0.dylib',
  'libggml.0.dylib',
  'libggml-base.0.dylib',
  'libssl.3.dylib',
  'libcrypto.3.dylib',
  'libomp.dylib',
] as const;

export const LOCAL_AI_RUNTIME_BACKEND_PLUGINS = [
  'libggml-blas.so',
  'libggml-cpu-apple_m1.so',
  'libggml-cpu-apple_m2_m3.so',
  'libggml-cpu-apple_m4.so',
  'libggml-metal.so',
] as const;

export const resolveLocalAIAssets = (resourcesRoot: string) => ({
  binaryPath: path.join(resourcesRoot, 'local-ai', 'bin', 'llama-server'),
  modelPath: path.join(
    resourcesRoot,
    'local-ai',
    'models',
    'gemma-3-4b-it.gguf'
  ),
  dylibPaths: LOCAL_AI_RUNTIME_LIBRARIES.map(fileName =>
    path.join(resourcesRoot, 'local-ai', 'lib', fileName)
  ),
  backendPluginPaths: LOCAL_AI_RUNTIME_BACKEND_PLUGINS.map(fileName =>
    path.join(resourcesRoot, 'local-ai', 'bin', fileName)
  ),
});
