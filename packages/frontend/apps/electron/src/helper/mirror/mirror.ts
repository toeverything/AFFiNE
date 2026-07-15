import { createHash } from 'node:crypto';
import { parse, relative, resolve, sep } from 'node:path';

import fs from 'fs-extra';
import { nanoid } from 'nanoid';

import { isPathInsideBase } from '../../shared/utils';
import { mainRPC } from '../main-rpc';

const MIRROR_DIR = '.affine';
const MANIFEST_FILE = 'mirror.json';
const JOURNAL_FILE = '.generation.json';
const MAX_FILE_BYTES = 128 * 1024 * 1024;
const MAX_BATCH_BYTES = 128 * 1024 * 1024;

export type MirrorFileKind =
  | 'index'
  | 'workspace'
  | 'markdown'
  | 'snapshot'
  | 'asset';

export type MirrorManifest = {
  formatVersion: 1;
  workspaceId: string;
  workspaceFlavour: string;
  generation: string;
  lastCompletedAt: string;
  sourceSyncState: 'synced' | 'cached-offline';
  files: Record<
    string,
    {
      kind: MirrorFileKind;
      sha256: string;
      docId?: string;
      sourceHash?: string;
    }
  >;
};

export type MirrorWriteFile = {
  path: string;
  kind: MirrorFileKind;
  content: string | Uint8Array;
  docId?: string;
  sourceHash?: string;
};

type GenerationJournal = {
  workspaceId: string;
  generation: string;
  files: Record<string, string>;
};

function sha256(content: string | Uint8Array) {
  return createHash('sha256').update(content).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseManifest(value: unknown): MirrorManifest | null {
  if (
    !isRecord(value) ||
    value.formatVersion !== 1 ||
    typeof value.workspaceId !== 'string' ||
    typeof value.workspaceFlavour !== 'string' ||
    typeof value.generation !== 'string' ||
    typeof value.lastCompletedAt !== 'string' ||
    (value.sourceSyncState !== 'synced' &&
      value.sourceSyncState !== 'cached-offline') ||
    !isRecord(value.files)
  ) {
    return null;
  }
  for (const [path, entry] of Object.entries(value.files)) {
    if (
      !isManagedRelativePath(path) ||
      !isRecord(entry) ||
      typeof entry.sha256 !== 'string' ||
      !['index', 'workspace', 'markdown', 'snapshot', 'asset'].includes(
        String(entry.kind)
      )
    ) {
      return null;
    }
  }
  return value as MirrorManifest;
}

function isManagedRelativePath(path: string) {
  if (path === 'index.md' || path === 'workspace.json') {
    return true;
  }
  const normalized = path.replaceAll('\\', '/');
  if (normalized !== path || normalized.includes('\0')) {
    return false;
  }
  const match = /^(docs|snapshots|assets)\/([^/]+)$/.exec(path);
  if (!match || match[2] === '.' || match[2] === '..') {
    return false;
  }
  if (match[1] === 'docs') return match[2].endsWith('.md');
  if (match[1] === 'snapshots') return match[2].endsWith('.snapshot.json');
  return true;
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function assertNoSymlink(path: string, label: string) {
  if (!(await fs.pathExists(path))) return;
  const stat = await fs.lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
}

async function validateProjectRoot(projectRoot: string) {
  if (typeof projectRoot !== 'string' || !projectRoot) {
    throw new Error('Invalid project root');
  }
  const resolved = resolve(projectRoot);
  if (parse(resolved).root === resolved) {
    throw new Error('A filesystem root cannot be used as a project root');
  }
  await assertNoSymlink(resolved, 'Project root');
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) throw new Error('Project root is not a directory');
  const canonical = await fs.realpath(resolved);
  for (const name of ['userData', 'sessionData'] as const) {
    const appPath = resolve(await mainRPC.getPath(name));
    if (
      isPathInsideBase(appPath, canonical, {
        caseInsensitive: process.platform === 'win32',
      }) ||
      isPathInsideBase(canonical, appPath, {
        caseInsensitive: process.platform === 'win32',
      })
    ) {
      throw new Error('AFFiNE application data cannot be mirrored');
    }
  }
  return canonical;
}

async function validateMirror(projectRoot: string, create = false) {
  const canonicalRoot = await validateProjectRoot(projectRoot);
  const mirrorPath = resolve(canonicalRoot, MIRROR_DIR);
  if (!isPathInsideBase(canonicalRoot, mirrorPath)) {
    throw new Error('Invalid mirror path');
  }
  await assertNoSymlink(mirrorPath, 'Mirror directory');
  if (create) await fs.ensureDir(mirrorPath);
  if (await fs.pathExists(mirrorPath)) {
    const realMirror = await fs.realpath(mirrorPath);
    if (!isPathInsideBase(canonicalRoot, realMirror)) {
      throw new Error('Mirror directory escapes the project root');
    }
  }
  return { projectRoot: canonicalRoot, mirrorPath };
}

async function managedPath(mirrorPath: string, childPath: string) {
  if (!isManagedRelativePath(childPath)) {
    throw new Error(`Invalid mirror file path: ${childPath}`);
  }
  const target = resolve(mirrorPath, childPath);
  if (!isPathInsideBase(mirrorPath, target)) {
    throw new Error('Mirror file escapes the mirror directory');
  }
  let current = mirrorPath;
  for (const part of relative(mirrorPath, target).split(sep)) {
    current = resolve(current, part);
    await assertNoSymlink(current, 'Mirror path');
  }
  return target;
}

async function atomicWrite(path: string, content: string | Uint8Array) {
  await fs.ensureDir(parse(path).dir);
  const tempPath = `${path}.${nanoid(8)}.tmp`;
  try {
    await fs.writeFile(tempPath, content);
    await fs.move(tempPath, path, { overwrite: true });
  } finally {
    await fs.remove(tempPath).catch(() => undefined);
  }
}

async function currentHash(path: string) {
  if (!(await fs.pathExists(path))) return null;
  return sha256(await fs.readFile(path));
}

async function loadManifest(mirrorPath: string) {
  const value = await readJson(resolve(mirrorPath, MANIFEST_FILE));
  if (value === null) return null;
  const manifest = parseManifest(value);
  if (!manifest) throw new Error('Invalid mirror manifest');
  return manifest;
}

async function cleanupInterruptedGeneration(mirrorPath: string) {
  const journalPath = resolve(mirrorPath, JOURNAL_FILE);
  const value = await readJson(journalPath);
  if (!isRecord(value) || !isRecord(value.files)) return;
  const manifest = await loadManifest(mirrorPath);
  for (const [childPath, expectedHash] of Object.entries(value.files)) {
    if (typeof expectedHash !== 'string' || !isManagedRelativePath(childPath)) {
      continue;
    }
    const target = await managedPath(mirrorPath, childPath);
    if (
      (await currentHash(target)) === expectedHash &&
      manifest?.files[childPath]?.sha256 !== expectedHash
    ) {
      await fs.remove(target);
    }
  }
  await fs.remove(journalPath);
}

export async function selectProjectDirectory() {
  const result = await mainRPC.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select project directory',
    buttonLabel: 'Use this project',
    defaultPath: await mainRPC.getPath('documents'),
    message: 'AFFiNE will manage the .affine folder inside this directory',
  });
  const selected = result.filePaths?.[0];
  if (result.canceled || !selected) return { canceled: true as const };
  const projectRoot = await validateProjectRoot(selected);
  return {
    canceled: false as const,
    projectRoot,
    mirrorPath: resolve(projectRoot, MIRROR_DIR),
  };
}

export async function inspectTarget(input: {
  projectRoot: string;
  workspaceId: string;
  recoverInterrupted?: boolean;
}) {
  const { projectRoot, mirrorPath } = await validateMirror(input.projectRoot);
  if (!(await fs.pathExists(mirrorPath))) {
    return { state: 'empty' as const, projectRoot, mirrorPath, manifest: null };
  }
  if (input.recoverInterrupted) {
    await cleanupInterruptedGeneration(mirrorPath);
  }
  const manifest = await loadManifest(mirrorPath);
  if (manifest && manifest.workspaceId !== input.workspaceId) {
    return { state: 'foreign' as const, projectRoot, mirrorPath, manifest };
  }
  if (!manifest && (await fs.readdir(mirrorPath)).length > 0) {
    return {
      state: 'unowned' as const,
      projectRoot,
      mirrorPath,
      manifest: null,
    };
  }
  return {
    state: manifest ? ('owned' as const) : ('empty' as const),
    projectRoot,
    mirrorPath,
    manifest,
  };
}

export async function writeBatch(input: {
  projectRoot: string;
  workspaceId: string;
  generation: string;
  files: MirrorWriteFile[];
  replaceConflicts?: boolean;
}) {
  const { mirrorPath } = await validateMirror(input.projectRoot, true);
  const manifest = await loadManifest(mirrorPath);
  if (manifest && manifest.workspaceId !== input.workspaceId) {
    throw new Error('Mirror belongs to another workspace');
  }
  let batchBytes = 0;
  const planned: Record<string, string> = {};
  for (const file of input.files) {
    const size =
      typeof file.content === 'string'
        ? Buffer.byteLength(file.content)
        : file.content.byteLength;
    if (size > MAX_FILE_BYTES) throw new Error('Mirror file is too large');
    batchBytes += size;
    if (batchBytes > MAX_BATCH_BYTES)
      throw new Error('Mirror batch is too large');
    await managedPath(mirrorPath, file.path);
    planned[file.path] = sha256(file.content);
  }
  const conflicts: string[] = [];
  for (const file of input.files) {
    const target = await managedPath(mirrorPath, file.path);
    const existing = await currentHash(target);
    const baseline = manifest?.files[file.path]?.sha256 ?? null;
    if (
      existing !== null &&
      existing !== planned[file.path] &&
      existing !== baseline &&
      !input.replaceConflicts
    ) {
      conflicts.push(file.path);
    }
  }
  if (conflicts.length > 0) return { conflicts, hashes: {} };

  const journalPath = resolve(mirrorPath, JOURNAL_FILE);
  const previousJournal = await readJson(journalPath);
  const journal: GenerationJournal =
    isRecord(previousJournal) &&
    previousJournal.workspaceId === input.workspaceId &&
    previousJournal.generation === input.generation &&
    isRecord(previousJournal.files)
      ? (previousJournal as GenerationJournal)
      : {
          workspaceId: input.workspaceId,
          generation: input.generation,
          files: {},
        };
  for (const file of input.files) {
    const target = await managedPath(mirrorPath, file.path);
    if ((await currentHash(target)) === planned[file.path]) {
      continue;
    }
    journal.files[file.path] = planned[file.path];
    await atomicWrite(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
    await atomicWrite(target, file.content);
  }
  return { conflicts: [], hashes: planned };
}

export async function finalizeGeneration(input: {
  projectRoot: string;
  workspaceId: string;
  manifest: MirrorManifest;
  stalePaths: string[];
  replaceConflicts?: boolean;
}) {
  const { mirrorPath } = await validateMirror(input.projectRoot, true);
  const previous = await loadManifest(mirrorPath);
  if (input.manifest.workspaceId !== input.workspaceId) {
    throw new Error('Manifest workspace mismatch');
  }
  if (previous && previous.workspaceId !== input.workspaceId) {
    throw new Error('Mirror belongs to another workspace');
  }
  const conflicts: string[] = [];
  for (const childPath of input.stalePaths) {
    const baseline = previous?.files[childPath]?.sha256;
    if (!baseline) continue;
    const target = await managedPath(mirrorPath, childPath);
    const existing = await currentHash(target);
    if (existing === baseline || input.replaceConflicts) {
      await fs.remove(target);
    } else if (existing !== null) {
      conflicts.push(childPath);
    }
  }
  if (conflicts.length > 0) return { conflicts };
  for (const childPath of Object.keys(input.manifest.files)) {
    if (!isManagedRelativePath(childPath)) {
      throw new Error('Invalid manifest path');
    }
  }
  await atomicWrite(
    resolve(mirrorPath, MANIFEST_FILE),
    `${JSON.stringify(input.manifest, null, 2)}\n`
  );
  await fs.remove(resolve(mirrorPath, JOURNAL_FILE));
  return { conflicts: [] };
}

export async function revealMirror(input: {
  projectRoot: string;
  workspaceId: string;
}) {
  const inspection = await inspectTarget(input);
  if (inspection.state !== 'owned' && inspection.state !== 'empty') {
    throw new Error('Mirror is not owned by this workspace');
  }
  await mainRPC.showItemInFolder(inspection.mirrorPath);
}
