import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCAL_AI_RUNTIME_LIBRARIES = [
  'libllama-server-impl.dylib',
  'libllama-common.0.dylib',
  'libmtmd.0.dylib',
  'libllama.0.dylib',
  'libggml.0.dylib',
  'libggml-base.0.dylib',
  'libssl.3.dylib',
  'libcrypto.3.dylib',
  'libomp.dylib',
];

const LOCAL_AI_RUNTIME_BACKEND_PLUGINS = [
  'libggml-blas.so',
  'libggml-cpu-apple_m1.so',
  'libggml-cpu-apple_m2_m3.so',
  'libggml-cpu-apple_m4.so',
  'libggml-metal.so',
];

const LLAMA_CPP_REPOSITORY = 'https://github.com/ggml-org/llama.cpp.git';
const LLAMA_CPP_COMMIT = '75ad0b23ed6dc98ce384953e1f9bc494c3de92ce';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '../../../../..');
const cacheRoot = path.join(repoRoot, '.cache', 'local-ai-runtime');
const sourceRoot = path.join(cacheRoot, 'llama.cpp');
const buildRoot = path.join(cacheRoot, 'build');
const runtimeRoot = path.join(cacheRoot, 'darwin-arm64');

const log = message => {
  console.log(`[local-ai] ${message}`);
};

const run = (command, args, options = {}) => {
  execFileSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
};

const getCommandOutput = (command, args) =>
  execFileSync(command, args, {
    encoding: 'utf8',
  }).trim();

const ensureDirectory = dirPath => {
  mkdirSync(dirPath, { recursive: true });
};

const ensureLlamaSource = () => {
  ensureDirectory(cacheRoot);

  if (!existsSync(path.join(sourceRoot, '.git'))) {
    log(`cloning llama.cpp into ${sourceRoot}`);
    run(
      'git',
      ['clone', '--filter=blob:none', LLAMA_CPP_REPOSITORY, sourceRoot],
      {
        cwd: cacheRoot,
      }
    );
  }

  log(`fetching llama.cpp commit ${LLAMA_CPP_COMMIT}`);
  run('git', ['fetch', '--depth', '1', 'origin', LLAMA_CPP_COMMIT], {
    cwd: sourceRoot,
  });
  run('git', ['checkout', '--force', LLAMA_CPP_COMMIT], {
    cwd: sourceRoot,
  });
};

const findFile = (root, fileName) => {
  const stack = [root];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    const entries = readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (entry.name === fileName) {
        return entryPath;
      }
    }
  }

  return null;
};

const copyRequiredFile = (searchRoots, fileName, destinationPath) => {
  for (const searchRoot of searchRoots) {
    if (!existsSync(searchRoot)) {
      continue;
    }

    const matchedPath = findFile(searchRoot, fileName);
    if (matchedPath) {
      cpSync(matchedPath, destinationPath);
      ensureArm64Artifact(destinationPath);
      return;
    }
  }

  throw new Error(`[local-ai] missing required runtime artifact: ${fileName}`);
};

const prepareRuntimeRoot = () => {
  ensureDirectory(runtimeRoot);
  rmSync(runtimeRoot, { recursive: true, force: true });
  ensureDirectory(runtimeRoot);
};

const ensureArm64Artifact = artifactPath => {
  const archs = getCommandOutput('lipo', ['-archs', artifactPath]);
  if (!archs.split(/\s+/).includes('arm64')) {
    throw new Error(
      `[local-ai] non-arm64 runtime artifact: ${artifactPath} (${archs})`
    );
  }
};

const buildLlamaRuntime = () => {
  const opensslRoot =
    process.env.LOCAL_AI_OPENSSL_ROOT ??
    getCommandOutput('brew', ['--prefix', 'openssl@3']);
  const libompRoot =
    process.env.LOCAL_AI_LIBOMP_ROOT ??
    getCommandOutput('brew', ['--prefix', 'libomp']);

  rmSync(buildRoot, { recursive: true, force: true });
  ensureDirectory(buildRoot);

  const cmakeArgs = [
    '-S',
    sourceRoot,
    '-B',
    buildRoot,
    '-DCMAKE_BUILD_TYPE=Release',
    '-DBUILD_SHARED_LIBS=ON',
    '-DGGML_BACKEND_DL=ON',
    '-DGGML_CPU_ALL_VARIANTS=ON',
    '-DGGML_METAL=ON',
    '-DGGML_METAL_EMBED_LIBRARY=ON',
    '-DGGML_BLAS=ON',
    '-DGGML_BLAS_VENDOR=Apple',
    '-DGGML_OPENMP=ON',
    `-DOpenMP_ROOT=${libompRoot}`,
    '-DLLAMA_BUILD_TESTS=OFF',
    '-DLLAMA_BUILD_EXAMPLES=ON',
    '-DLLAMA_BUILD_SERVER=ON',
    '-DLLAMA_BUILD_TOOLS=ON',
    '-DLLAMA_BUILD_APP=OFF',
    '-DLLAMA_OPENSSL=ON',
    `-DOpenSSL_ROOT_DIR=${opensslRoot}`,
    `-DCMAKE_PREFIX_PATH=${opensslRoot};${libompRoot}`,
  ];

  log(`configuring llama.cpp build in ${buildRoot}`);
  run('cmake', cmakeArgs, { cwd: repoRoot });

  log('building local AI runtime from source');
  run(
    'cmake',
    [
      '--build',
      buildRoot,
      '--config',
      'Release',
      '-j',
      String(os.cpus().length),
    ],
    {
      cwd: repoRoot,
    }
  );

  prepareRuntimeRoot();

  const searchRoots = [buildRoot];
  const opensslLibRoot = path.join(opensslRoot, 'lib');
  const libompLibRoot = path.join(libompRoot, 'lib');

  copyRequiredFile(
    searchRoots,
    'llama-server',
    path.join(runtimeRoot, 'llama-server')
  );

  for (const fileName of LOCAL_AI_RUNTIME_LIBRARIES) {
    const dependencyRoots =
      fileName === 'libssl.3.dylib' || fileName === 'libcrypto.3.dylib'
        ? [opensslLibRoot]
        : fileName === 'libomp.dylib'
          ? [libompLibRoot]
          : searchRoots;

    copyRequiredFile(
      dependencyRoots,
      fileName,
      path.join(runtimeRoot, fileName)
    );
  }

  for (const fileName of LOCAL_AI_RUNTIME_BACKEND_PLUGINS) {
    copyRequiredFile(searchRoots, fileName, path.join(runtimeRoot, fileName));
  }

  log(`prepared darwin-arm64 runtime into ${runtimeRoot}`);
};

ensureLlamaSource();
buildLlamaRuntime();
