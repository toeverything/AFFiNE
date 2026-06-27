import path from 'node:path';

export const LOCAL_AI_MODEL_FILENAME = 'gemma-3-4b-it.gguf';

const OFFICIAL_LOCAL_AI_MODEL_DOWNLOAD_URL =
  'https://huggingface.co/bartowski/google_gemma-3-4b-it-GGUF/resolve/main/google_gemma-3-4b-it-Q4_K_M.gguf?download=true';
const MIRROR_LOCAL_AI_MODEL_DOWNLOAD_URL =
  'https://hf-mirror.com/bartowski/google_gemma-3-4b-it-GGUF/resolve/main/google_gemma-3-4b-it-Q4_K_M.gguf?download=true';

export const LOCAL_AI_MODEL_DOWNLOAD_URLS =
  process.env.AFFINE_LOCAL_AI_DOWNLOAD_URL?.trim()
    ? [process.env.AFFINE_LOCAL_AI_DOWNLOAD_URL.trim()]
    : [
        MIRROR_LOCAL_AI_MODEL_DOWNLOAD_URL,
        OFFICIAL_LOCAL_AI_MODEL_DOWNLOAD_URL,
      ];

export const LOCAL_AI_MODEL_DOWNLOAD_URL = LOCAL_AI_MODEL_DOWNLOAD_URLS[0];

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

export const getLocalAIModelDirectory = (userDataPath: string) =>
  path.join(userDataPath, 'local-ai', 'models');

export const getDownloadedLocalAIModelPath = (userDataPath: string) =>
  path.join(getLocalAIModelDirectory(userDataPath), LOCAL_AI_MODEL_FILENAME);

export const getBundledLocalAIModelPath = (resourcesRoot: string) =>
  path.join(resourcesRoot, 'local-ai', 'models', LOCAL_AI_MODEL_FILENAME);

/** Optional dev-only model path; does not affect download status checks. */
export const getDevLocalAIModelPath = () =>
  process.env.AFFINE_LOCAL_AI_DEV_MODEL_PATH?.trim() || null;

export const resolveLocalAIAssets = (
  resourcesRoot: string,
  userDataPath: string
) => ({
  binaryPath: path.join(resourcesRoot, 'local-ai', 'bin', 'llama-server'),
  bundledModelPath: getBundledLocalAIModelPath(resourcesRoot),
  downloadedModelPath: getDownloadedLocalAIModelPath(userDataPath),
  modelDirectory: getLocalAIModelDirectory(userDataPath),
  dylibPaths: LOCAL_AI_RUNTIME_LIBRARIES.map(fileName =>
    path.join(resourcesRoot, 'local-ai', 'lib', fileName)
  ),
  backendPluginPaths: LOCAL_AI_RUNTIME_BACKEND_PLUGINS.map(fileName =>
    path.join(resourcesRoot, 'local-ai', 'bin', fileName)
  ),
});
