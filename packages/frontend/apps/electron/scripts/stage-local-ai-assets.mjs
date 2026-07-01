import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { access, chmod, copyFile, mkdir, rm } from 'node:fs/promises';
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

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '../../../../..');
const electronAppDir = path.resolve(scriptDir, '..');

const generatedSourceRoot = path.join(
  repoRoot,
  '.cache',
  'local-ai-runtime',
  'darwin-arm64'
);
const legacySourceRoot = path.join(
  repoRoot,
  'vendor',
  'local-ai',
  'darwin-arm64'
);
const sourceRoot =
  process.env.LOCAL_AI_RUNTIME_SOURCE_ROOT ??
  (existsSync(generatedSourceRoot) ? generatedSourceRoot : legacySourceRoot);
const sourceBinaryPath = path.join(sourceRoot, 'llama-server');
const stagedRoot = path.join(electronAppDir, 'resources', 'local-ai');
const stagedBinaryPath = path.join(stagedRoot, 'bin', 'llama-server');
const stagedLibDir = path.join(stagedRoot, 'lib');
const dylibEntries = LOCAL_AI_RUNTIME_LIBRARIES.map(fileName => ({
  fileName,
  sourcePath: path.join(sourceRoot, fileName),
  stagedPath: path.join(stagedLibDir, fileName),
}));
const backendPluginEntries = LOCAL_AI_RUNTIME_BACKEND_PLUGINS.map(fileName => ({
  fileName,
  sourcePath: path.join(sourceRoot, fileName),
  stagedPath: path.join(stagedRoot, 'bin', fileName),
}));

const hasRpath = (targetPath, rpath) => {
  const output = execFileSync('otool', ['-l', targetPath], {
    encoding: 'utf8',
  });
  return output.includes(`path ${rpath} `);
};

const addRpath = (targetPath, rpath) => {
  if (hasRpath(targetPath, rpath)) {
    return;
  }

  execFileSync('install_name_tool', ['-add_rpath', rpath, targetPath], {
    stdio: 'ignore',
  });
};

const hasSignature = targetPath => {
  try {
    execFileSync('codesign', ['--display', '--verbose=1', targetPath], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
};

const stripSignature = targetPath => {
  if (!hasSignature(targetPath)) {
    return;
  }

  execFileSync('codesign', ['--remove-signature', targetPath], {
    stdio: 'ignore',
  });

  if (hasSignature(targetPath)) {
    throw new Error(
      `[local-ai] failed to strip code signature from ${targetPath}`
    );
  }
};

const adHocSign = targetPath => {
  execFileSync('codesign', ['--force', '--sign', '-', targetPath], {
    stdio: 'ignore',
  });

  if (!hasSignature(targetPath)) {
    throw new Error(`[local-ai] failed to ad-hoc sign ${targetPath}`);
  }
};

try {
  await access(sourceBinaryPath);
  await Promise.all(dylibEntries.map(entry => access(entry.sourcePath)));
  await Promise.all(
    backendPluginEntries.map(entry => access(entry.sourcePath))
  );
} catch {
  throw new Error(
    `[local-ai] runtime assets not found in ${sourceRoot}. ` +
      `Run node packages/frontend/apps/electron/scripts/prepare-local-ai-runtime.mjs ` +
      `or set LOCAL_AI_RUNTIME_SOURCE_ROOT to a prepared darwin-arm64 runtime directory.`
  );
}
await rm(stagedRoot, { recursive: true, force: true });
await mkdir(path.dirname(stagedBinaryPath), { recursive: true });
await mkdir(stagedLibDir, { recursive: true });
await copyFile(sourceBinaryPath, stagedBinaryPath);
await Promise.all(
  [...dylibEntries, ...backendPluginEntries].map(async entry => {
    await copyFile(entry.sourcePath, entry.stagedPath);
    await chmod(entry.stagedPath, 0o755);
  })
);
await chmod(stagedBinaryPath, 0o755);

for (const entry of dylibEntries) {
  addRpath(entry.stagedPath, '@loader_path');
}

for (const entry of backendPluginEntries) {
  addRpath(entry.stagedPath, '@loader_path/../lib');
}

addRpath(stagedBinaryPath, '@loader_path/../lib');

for (const targetPath of [
  stagedBinaryPath,
  ...dylibEntries.map(entry => entry.stagedPath),
  ...backendPluginEntries.map(entry => entry.stagedPath),
]) {
  stripSignature(targetPath);
}

if (process.platform === 'darwin' && !process.env.APPLE_CODESIGN_IDENTITY) {
  for (const targetPath of [
    ...dylibEntries.map(entry => entry.stagedPath),
    ...backendPluginEntries.map(entry => entry.stagedPath),
    stagedBinaryPath,
  ]) {
    adHocSign(targetPath);
  }
}

console.log(`[local-ai] staged resources into ${stagedRoot}`);
