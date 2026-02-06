import { spawnSync } from 'node:child_process';
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

const distDir = path.join(APP_ROOT, 'dist');
await pruneServerNative(distDir, serverNativeArch(targetKey));

await pruneOptionalNativeDeps(
  path.join(APP_ROOT, 'node_modules'),
  cpuPruneRegexes(targetKey)
);

await prunePrismaEngines(APP_ROOT, targetKey);

await Promise.all([
  rmrf(path.join(APP_ROOT, 'node_modules', 'typescript')).catch(() => {}),
  rmrf(path.join(APP_ROOT, 'node_modules', 'ts-node')).catch(() => {}),
  rmrf(path.join(APP_ROOT, 'node_modules', '@types')).catch(() => {}),
  rmrf(path.join(APP_ROOT, 'src')).catch(() => {}),
  rmrf(path.join(APP_ROOT, '.gitignore')).catch(() => {}),
  rmrf(path.join(APP_ROOT, '.dockerignore')).catch(() => {}),
  rmrf(path.join(APP_ROOT, '.env.example')).catch(() => {}),
  rmrf(path.join(APP_ROOT, 'ava.config.js')).catch(() => {}),
  rmrf(path.join(APP_ROOT, 'tsconfig.json')).catch(() => {}),
  rmrf(path.join(APP_ROOT, 'config.example.json')).catch(() => {}),
]);
