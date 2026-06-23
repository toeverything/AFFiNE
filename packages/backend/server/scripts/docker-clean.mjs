import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_APP_ROOT = path.resolve(SCRIPT_DIR, '..');
const APP_ROOT = process.env.APP_ROOT ?? DEFAULT_APP_ROOT;
const TARGETARCH = process.env.TARGETARCH ?? '';
const TARGETVARIANT = process.env.TARGETVARIANT ?? '';
const ALLOW_RUN = process.env.AFFINE_DOCKER_CLEAN === '1';
const VERBOSE = process.env.AFFINE_DOCKER_CLEAN_VERBOSE === '1';

function log(message) {
  console.log(`[docker-clean] ${message}`);
}

function debug(message) {
  if (VERBOSE) {
    log(message);
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function safeReadDir(dirPath) {
  try {
    return await fs.readdir(dirPath);
  } catch {
    return [];
  }
}

async function rmrf(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function fileSize(filePath) {
  const stat = await fs.lstat(filePath).catch(() => null);
  return stat?.isFile() ? stat.size : 0;
}

async function walkFiles(rootDir) {
  if (!(await exists(rootDir))) {
    return [];
  }

  const files = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (err) {
      debug(`skip unreadable dir ${current}: ${err?.message ?? String(err)}`);
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const dirent of entries) {
      const fullPath = path.join(current, dirent.name);
      if (dirent.isDirectory()) {
        stack.push(fullPath);
      } else if (dirent.isFile()) {
        files.push(fullPath);
      }
    }
  }

  files.sort();
  return files;
}

async function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  const handle = await fs.open(filePath, 'r');
  try {
    for await (const chunk of handle.readableWebStream()) {
      hash.update(Buffer.from(chunk));
    }
  } finally {
    await handle.close().catch(() => {});
  }
  return hash.digest('hex');
}

async function hardlinkDuplicate(canonicalPath, duplicatePath) {
  const tempPath = path.join(
    path.dirname(duplicatePath),
    `.docker-clean-link-${process.pid}-${Date.now()}-${path.basename(
      duplicatePath
    )}`
  );

  try {
    await fs.link(canonicalPath, tempPath);
    await fs.rename(tempPath, duplicatePath);
    return true;
  } catch (err) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    debug(
      `failed to hardlink ${duplicatePath} -> ${canonicalPath}: ${
        err?.message ?? String(err)
      }`
    );
    return false;
  }
}

function hasCompatibleHardlinkMetadata(canonicalStat, duplicateStat) {
  return (
    canonicalStat.mode === duplicateStat.mode &&
    canonicalStat.uid === duplicateStat.uid &&
    canonicalStat.gid === duplicateStat.gid
  );
}

async function hardlinkDuplicateFiles(rootDir) {
  const files = await walkFiles(rootDir);
  const bySize = new Map();

  for (const filePath of files) {
    const size = await fileSize(filePath);
    if (size === 0) {
      continue;
    }
    const sizedFiles = bySize.get(size);
    if (sizedFiles) {
      sizedFiles.push(filePath);
    } else {
      bySize.set(size, [filePath]);
    }
  }

  let linked = 0;
  let savedBytes = 0;

  for (const [size, sizedFiles] of bySize) {
    if (sizedFiles.length < 2) {
      continue;
    }

    const byHash = new Map();
    for (const filePath of sizedFiles) {
      let digest;
      try {
        digest = await sha256(filePath);
      } catch (err) {
        debug(`failed to hash ${filePath}: ${err?.message ?? String(err)}`);
        continue;
      }

      const canonicalPath = byHash.get(digest);
      if (!canonicalPath) {
        byHash.set(digest, filePath);
        continue;
      }

      const [canonicalStat, duplicateStat] = await Promise.all([
        fs.lstat(canonicalPath).catch(() => null),
        fs.lstat(filePath).catch(() => null),
      ]);

      if (
        !canonicalStat ||
        !duplicateStat ||
        !hasCompatibleHardlinkMetadata(canonicalStat, duplicateStat)
      ) {
        continue;
      }

      if (
        canonicalStat.dev === duplicateStat.dev &&
        canonicalStat.ino === duplicateStat.ino
      ) {
        continue;
      }

      if (await hardlinkDuplicate(canonicalPath, filePath)) {
        linked += 1;
        savedBytes += size;
      }
    }
  }

  return { linked, savedBytes };
}

async function deleteFilesByExtension(rootDir, extension) {
  if (!(await exists(rootDir))) {
    return 0;
  }

  let deleted = 0;
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    let dir;
    try {
      dir = await fs.opendir(current);
    } catch (err) {
      debug(`skip unreadable dir ${current}: ${err?.message ?? String(err)}`);
      continue;
    }

    try {
      for await (const dirent of dir) {
        const fullPath = path.join(current, dirent.name);
        if (dirent.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (
          (dirent.isFile() || dirent.isSymbolicLink()) &&
          dirent.name.endsWith(extension)
        ) {
          try {
            await fs.unlink(fullPath);
            deleted += 1;
          } catch (err) {
            debug(
              `failed to delete ${fullPath}: ${err?.message ?? String(err)}`
            );
          }
        }
      }
    } finally {
      await dir.close().catch(() => {});
    }
  }

  return deleted;
}

async function deleteFilesByPredicate(rootDir, shouldDelete) {
  if (!(await exists(rootDir))) {
    return { deleted: 0, bytes: 0 };
  }

  let deleted = 0;
  let bytes = 0;
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (err) {
      debug(`skip unreadable dir ${current}: ${err?.message ?? String(err)}`);
      continue;
    }

    for (const dirent of entries) {
      const fullPath = path.join(current, dirent.name);
      if (dirent.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (!dirent.isFile() || !shouldDelete(fullPath, dirent.name)) {
        continue;
      }

      const size = await fileSize(fullPath);
      try {
        await fs.unlink(fullPath);
        deleted += 1;
        bytes += size;
      } catch (err) {
        debug(`failed to delete ${fullPath}: ${err?.message ?? String(err)}`);
      }
    }
  }

  return { deleted, bytes };
}

async function deleteDirsByName(rootDir, names, shouldPreserve = () => false) {
  if (!(await exists(rootDir))) {
    return { deleted: 0, bytes: 0 };
  }

  let deleted = 0;
  let bytes = 0;
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (err) {
      debug(`skip unreadable dir ${current}: ${err?.message ?? String(err)}`);
      continue;
    }

    for (const dirent of entries) {
      if (!dirent.isDirectory()) {
        continue;
      }

      const fullPath = path.join(current, dirent.name);
      if (shouldPreserve(fullPath)) {
        stack.push(fullPath);
        continue;
      }

      if (names.has(dirent.name)) {
        const dirBytes = await directoryBytes(fullPath);
        try {
          await rmrf(fullPath);
          deleted += 1;
          bytes += dirBytes;
        } catch (err) {
          debug(`failed to delete ${fullPath}: ${err?.message ?? String(err)}`);
        }
      } else {
        stack.push(fullPath);
      }
    }
  }

  return { deleted, bytes };
}

async function directoryBytes(rootDir) {
  let bytes = 0;
  for (const filePath of await walkFiles(rootDir)) {
    bytes += await fileSize(filePath);
  }
  return bytes;
}

function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MiB`;
}

function normalizeTargetKey(arch, variant) {
  // BuildKit: TARGETARCH=arm TARGETVARIANT=v7
  if (arch === 'arm' && variant === 'v7') {
    return 'armv7';
  }
  return `${arch}${variant ?? ''}`;
}

function serverNativeArch(targetKey) {
  switch (targetKey) {
    case 'amd64':
      return 'x64';
    case 'arm64':
      return 'arm64';
    case 'armv7':
    case 'arm':
      return 'armv7';
    default:
      return '';
  }
}

async function pruneServerNative(distDir, keepArch) {
  if (!keepArch) {
    return;
  }

  const keepName = `server-native.${keepArch}.node`;
  const entries = await safeReadDir(distDir);

  await Promise.all(
    entries.map(async name => {
      if (
        name.startsWith('server-native.') &&
        name.endsWith('.node') &&
        name !== keepName
      ) {
        await fs.rm(path.join(distDir, name), { force: true }).catch(() => {});
      }
    })
  );
}

function cpuPruneRegexes(targetKey) {
  switch (targetKey) {
    case 'arm64':
      return [/-linux-x64-/, /-linux-x64$/, /-linux-arm-/, /-linux-arm$/];
    case 'amd64':
      return [/-linux-arm64-/, /-linux-arm64$/, /-linux-arm-/, /-linux-arm$/];
    case 'armv7':
    case 'arm':
      return [/-linux-x64-/, /-linux-x64$/, /-linux-arm64-/, /-linux-arm64$/];
    default:
      return [];
  }
}

function shouldPruneDir(name, regexes) {
  return regexes.some(re => re.test(name));
}

async function pruneOptionalNativeDeps(nodeModulesDir, regexes) {
  if (!regexes.length || !(await exists(nodeModulesDir))) {
    return;
  }

  const topLevel = await safeReadDir(nodeModulesDir);

  for (const name of topLevel) {
    const fullPath = path.join(nodeModulesDir, name);
    const stat = await fs.lstat(fullPath).catch(() => null);
    if (!stat?.isDirectory()) {
      continue;
    }

    if (name.startsWith('@')) {
      const scopedEntries = await safeReadDir(fullPath);
      for (const scopedName of scopedEntries) {
        const scopedFullPath = path.join(fullPath, scopedName);
        const scopedStat = await fs.lstat(scopedFullPath).catch(() => null);
        if (!scopedStat?.isDirectory()) {
          continue;
        }
        if (shouldPruneDir(scopedName, regexes)) {
          await rmrf(scopedFullPath).catch(() => {});
        }
      }
      continue;
    }

    if (shouldPruneDir(name, regexes)) {
      await rmrf(fullPath).catch(() => {});
    }
  }
}

function preferredPrismaTargets(targetKey) {
  switch (targetKey) {
    case 'arm64':
      return ['linux-arm64-openssl-3.0.x', 'linux-arm64-openssl-1.1.x'];
    case 'amd64':
      return ['debian-openssl-3.0.x', 'debian-openssl-1.1.x'];
    case 'armv7':
    case 'arm':
      return ['linux-arm-openssl-3.0.x', 'linux-arm-openssl-1.1.x'];
    default:
      return [];
  }
}

async function pickExistingPrismaTarget(prismaClientDir, candidates) {
  const entries = new Set(await safeReadDir(prismaClientDir));
  for (const target of candidates) {
    if (entries.has(`libquery_engine-${target}.so.node`)) {
      return target;
    }
  }
  return '';
}

async function prunePrismaQueryEngines(dirPath, keepTarget) {
  if (!keepTarget || !(await exists(dirPath))) {
    return;
  }

  const keepName = `libquery_engine-${keepTarget}.so.node`;
  const entries = await safeReadDir(dirPath);

  if (!entries.includes(keepName)) {
    return;
  }

  for (const name of entries) {
    if (
      name.startsWith('libquery_engine-') &&
      name.endsWith('.so.node') &&
      name !== keepName
    ) {
      await fs.rm(path.join(dirPath, name), { force: true }).catch(() => {});
    }
  }
}

function runPrismaVersion(prismaBinPath, cwd) {
  const result = spawnSync(prismaBinPath, ['-v'], {
    cwd,
    env: process.env,
    stdio: VERBOSE ? 'inherit' : 'ignore',
  });
  return result.status === 0;
}

async function prunePrismaEngines(appRoot, targetKey) {
  const prismaClientDir = path.join(
    appRoot,
    'node_modules',
    '.prisma',
    'client'
  );
  const prismaPkgDir = path.join(appRoot, 'node_modules', 'prisma');
  const prismaEnginesDir = path.join(
    appRoot,
    'node_modules',
    '@prisma',
    'engines'
  );
  const prismaBinPath = path.join(appRoot, 'node_modules', '.bin', 'prisma');

  if (!(await exists(prismaClientDir))) {
    return;
  }

  const keepTarget = await pickExistingPrismaTarget(
    prismaClientDir,
    preferredPrismaTargets(targetKey)
  );

  if (!keepTarget) {
    debug('no prisma keepTarget detected, skip prisma pruning');
    return;
  }

  await prunePrismaQueryEngines(prismaClientDir, keepTarget);
  await prunePrismaQueryEngines(prismaPkgDir, keepTarget);

  const keepSchemaEngine = path.join(
    prismaEnginesDir,
    `schema-engine-${keepTarget}`
  );

  if ((await exists(prismaBinPath)) && !(await exists(keepSchemaEngine))) {
    runPrismaVersion(prismaBinPath, appRoot);
  }

  if (!(await exists(keepSchemaEngine))) {
    debug(`missing ${keepSchemaEngine}, skip pruning @prisma/engines`);
    return;
  }

  const keepLibQueryEngine = `libquery_engine-${keepTarget}.so.node`;
  const entries = await safeReadDir(prismaEnginesDir);

  for (const name of entries) {
    const isEngine =
      name.startsWith('schema-engine-') || name.startsWith('libquery_engine-');
    if (!isEngine) {
      continue;
    }

    const keep =
      name === `schema-engine-${keepTarget}` || name === keepLibQueryEngine;
    if (!keep) {
      await fs
        .rm(path.join(prismaEnginesDir, name), { force: true })
        .catch(() => {});
    }
  }
}

async function prunePrismaRuntimeArtifacts(nodeModulesDir) {
  const prismaClientRuntimeDir = path.join(
    nodeModulesDir,
    '@prisma',
    'client',
    'runtime'
  );
  const prismaClientCopyRuntimeDir = path.join(
    nodeModulesDir,
    'prisma',
    'prisma-client',
    'runtime'
  );

  let deleted = 0;
  let bytes = 0;

  for (const runtimeDir of [
    prismaClientRuntimeDir,
    prismaClientCopyRuntimeDir,
  ]) {
    const result = await deleteFilesByPredicate(
      runtimeDir,
      (_filePath, name) => {
        return (
          name.startsWith('query_engine_bg.') ||
          name.startsWith('query_compiler_bg.')
        );
      }
    );
    deleted += result.deleted;
    bytes += result.bytes;
  }

  return { deleted, bytes };
}

function isNodeModulesPackageRoot(nodeModulesDir, dirPath) {
  const relative = path.relative(nodeModulesDir, dirPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }

  const segments = ['node_modules', ...relative.split(path.sep)];
  const targetIndex = segments.length - 1;

  for (let i = 0; i < segments.length - 1; i += 1) {
    if (segments[i] !== 'node_modules') {
      continue;
    }

    const packageIndex = i + 1;
    if (!segments[packageIndex]) {
      continue;
    }

    if (segments[packageIndex].startsWith('@')) {
      if (targetIndex === packageIndex + 1) {
        return true;
      }
      continue;
    }

    if (targetIndex === packageIndex) {
      return true;
    }
  }

  return false;
}

async function pruneNodeModulesArtifacts(nodeModulesDir) {
  const disposableDirs = new Set([
    '.github',
    '.husky',
    'benchmark',
    'benchmarks',
    'coverage',
    'example',
    'examples',
    'test',
    'testing',
    'tests',
    '__tests__',
  ]);
  const disposableFilenames = new Set([
    '.npmignore',
    '.yarn-metadata.json',
    'CHANGELOG',
    'CHANGELOG.md',
    'HISTORY.md',
    'README',
    'README.md',
  ]);
  const disposableExtensions = [
    '.cts',
    '.d.cts',
    '.d.mts',
    '.d.ts',
    '.markdown',
    '.md',
    '.mts',
    '.ts',
    '.tsbuildinfo',
    '.tsx',
  ];

  const dirResult = await deleteDirsByName(
    nodeModulesDir,
    disposableDirs,
    dirPath => isNodeModulesPackageRoot(nodeModulesDir, dirPath)
  );
  const fileResult = await deleteFilesByPredicate(
    nodeModulesDir,
    (_filePath, name) => {
      if (name.toLowerCase().startsWith('license')) {
        return false;
      }
      return (
        disposableFilenames.has(name) ||
        disposableExtensions.some(extension => name.endsWith(extension))
      );
    }
  );

  return {
    deletedDirs: dirResult.deleted,
    deletedFiles: fileResult.deleted,
    bytes: dirResult.bytes + fileResult.bytes,
  };
}

const targetKey = normalizeTargetKey(TARGETARCH, TARGETVARIANT);

log(`root=${APP_ROOT} target=${targetKey || '(unknown)'}`);

if (!ALLOW_RUN) {
  log('skip (set AFFINE_DOCKER_CLEAN=1 to enable)');
  process.exit(0);
}

const deletedStaticMaps = await deleteFilesByExtension(
  path.join(APP_ROOT, 'static'),
  '.map'
);
const deletedNodeModulesMaps = await deleteFilesByExtension(
  path.join(APP_ROOT, 'node_modules'),
  '.map'
);

debug(`deleted static maps: ${deletedStaticMaps}`);
debug(`deleted node_modules maps: ${deletedNodeModulesMaps}`);

const staticDedupe = await hardlinkDuplicateFiles(
  path.join(APP_ROOT, 'static')
);
log(
  `hardlinked duplicate static files: ${staticDedupe.linked}, saved ${formatMiB(
    staticDedupe.savedBytes
  )}`
);

const distDir = path.join(APP_ROOT, 'dist');
await pruneServerNative(distDir, serverNativeArch(targetKey));

await pruneOptionalNativeDeps(
  path.join(APP_ROOT, 'node_modules'),
  cpuPruneRegexes(targetKey)
);

await prunePrismaEngines(APP_ROOT, targetKey);

const nodeModulesDir = path.join(APP_ROOT, 'node_modules');

const prismaRuntimeArtifacts =
  await prunePrismaRuntimeArtifacts(nodeModulesDir);
log(
  `deleted prisma runtime artifacts: ${prismaRuntimeArtifacts.deleted}, saved ${formatMiB(
    prismaRuntimeArtifacts.bytes
  )}`
);

const nodeModulesArtifacts = await pruneNodeModulesArtifacts(nodeModulesDir);
log(
  `deleted node_modules artifacts: ${nodeModulesArtifacts.deletedFiles} files, ${
    nodeModulesArtifacts.deletedDirs
  } dirs, saved ${formatMiB(nodeModulesArtifacts.bytes)}`
);

await Promise.all([
  rmrf(path.join(nodeModulesDir, 'typescript')).catch(() => {}),
  rmrf(path.join(nodeModulesDir, '@types')).catch(() => {}),
  rmrf(path.join(APP_ROOT, 'src')).catch(() => {}),
  rmrf(path.join(APP_ROOT, '.gitignore')).catch(() => {}),
  rmrf(path.join(APP_ROOT, '.dockerignore')).catch(() => {}),
  rmrf(path.join(APP_ROOT, '.env.example')).catch(() => {}),
  rmrf(path.join(APP_ROOT, 'ava.config.js')).catch(() => {}),
  rmrf(path.join(APP_ROOT, 'tsconfig.json')).catch(() => {}),
  rmrf(path.join(APP_ROOT, 'config.example.json')).catch(() => {}),
]);
