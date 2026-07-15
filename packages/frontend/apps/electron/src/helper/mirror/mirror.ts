import { createHash } from 'node:crypto';
import { parse, relative, resolve, sep } from 'node:path';

import fs from 'fs-extra';
import { nanoid } from 'nanoid';

import { isPathInsideBase } from '../../shared/utils';
import { mainRPC } from '../main-rpc';

const MIRROR_DIR = '.affine';
const MANIFEST_FILE = 'mirror.json';
const TRANSACTION_DIR = 'local-mirror-transactions';
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

type Lease = {
  id: string;
  projectRoot: string;
  mirrorPath: string;
  workspaceId: string;
  generation: string;
  previousGeneration: string | null;
  aborted: boolean;
  committing: boolean;
  txPath: string;
};

type TransactionRecord = {
  workspaceId: string;
  projectRoot: string;
  generation: string;
  previousGeneration: string | null;
  state: 'staging' | 'prepared' | 'committing';
  paths: string[];
  baselines?: Record<string, string | null>;
  planned?: Record<string, string | null>;
};

const leases = new Map<string, Lease>();
const activeMirrors = new Map<string, string>();

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
      !/^[a-f\d]{64}$/.test(entry.sha256) ||
      !['index', 'workspace', 'markdown', 'snapshot', 'asset'].includes(
        String(entry.kind)
      ) ||
      (entry.docId !== undefined && typeof entry.docId !== 'string') ||
      (entry.sourceHash !== undefined && typeof entry.sourceHash !== 'string')
    ) {
      return null;
    }
  }
  return value as MirrorManifest;
}

function isManagedRelativePath(path: string) {
  if (path === 'index.md' || path === 'workspace.json') return true;
  const normalized = path.replaceAll('\\', '/');
  if (normalized !== path || normalized.includes('\0')) return false;
  const match = /^(docs|snapshots|assets)\/([^/]+)$/.exec(path);
  if (!match || match[2] === '.' || match[2] === '..') return false;
  if (match[1] === 'docs') return match[2].endsWith('.md');
  if (match[1] === 'snapshots') return match[2].endsWith('.snapshot.json');
  return true;
}

async function readJson(path: string): Promise<unknown> {
  try {
    const stat = await fs.stat(path);
    if (stat.size > MAX_FILE_BYTES)
      throw new Error('Mirror metadata is too large');
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

async function safeChild(base: string, childPath: string) {
  await assertNoSymlink(base, 'Mirror internal directory');
  const target = resolve(base, childPath);
  if (!isPathInsideBase(base, target)) throw new Error('Path escapes base');
  let current = base;
  for (const part of relative(base, target).split(sep)) {
    current = resolve(current, part);
    await assertNoSymlink(current, 'Mirror path');
  }
  return target;
}

async function managedPath(mirrorPath: string, childPath: string) {
  if (!isManagedRelativePath(childPath)) {
    throw new Error(`Invalid mirror file path: ${childPath}`);
  }
  return safeChild(mirrorPath, childPath);
}

async function atomicWrite(
  path: string,
  content: string | Uint8Array,
  beforeMove?: () => void | Promise<void>
) {
  await fs.ensureDir(parse(path).dir);
  const tempPath = `${path}.${nanoid(8)}.tmp`;
  try {
    await fs.writeFile(tempPath, content);
    await beforeMove?.();
    await fs.move(tempPath, path, { overwrite: true });
  } finally {
    await fs.remove(tempPath).catch(() => undefined);
  }
}

async function atomicCopy(
  source: string,
  target: string,
  beforeMove?: () => void | Promise<void>
) {
  await fs.ensureDir(parse(target).dir);
  const tempPath = `${target}.${nanoid(8)}.tmp`;
  try {
    await fs.copy(source, tempPath, { overwrite: false });
    await beforeMove?.();
    await fs.move(tempPath, target, { overwrite: true });
  } finally {
    await fs.remove(tempPath).catch(() => undefined);
  }
}

async function currentHash(path: string) {
  if (!(await fs.pathExists(path))) return null;
  const stat = await fs.stat(path);
  if (!stat.isFile()) throw new Error('Managed path is not a file');
  if (stat.size > MAX_FILE_BYTES) throw new Error('Mirror file is too large');
  return new Promise<string>((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(path);
    let bytes = 0;
    stream.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_FILE_BYTES) {
        stream.destroy(new Error('Mirror file is too large'));
        return;
      }
      hash.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

async function loadManifest(mirrorPath: string) {
  const value = await readJson(resolve(mirrorPath, MANIFEST_FILE));
  if (value === null) return null;
  const manifest = parseManifest(value);
  if (!manifest) throw new Error('Invalid mirror manifest');
  return manifest;
}

function transactionPath(transactionRoot: string, leaseId: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(leaseId)) throw new Error('Invalid lease');
  return resolve(transactionRoot, leaseId);
}

async function getTransactionRoot() {
  const sessionData = resolve(await mainRPC.getPath('sessionData'));
  const root = resolve(sessionData, TRANSACTION_DIR);
  await assertNoSymlink(sessionData, 'Session data');
  await assertNoSymlink(root, 'Mirror transaction root');
  await fs.ensureDir(root);
  return root;
}

async function removeTransaction(tx: string) {
  await assertNoSymlink(tx, 'Transaction');
  await fs.remove(tx);
}

async function recoverTransactions(
  projectRoot: string,
  mirrorPath: string,
  workspaceId: string,
  manifest: MirrorManifest | null
) {
  const root = await getTransactionRoot();
  for (const name of await fs.readdir(root)) {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) continue;
    const tx = transactionPath(root, name);
    if ([...leases.values()].some(lease => lease.txPath === tx)) continue;
    await assertNoSymlink(tx, 'Transaction');
    const record = await readJson(resolve(tx, 'transaction.json'));
    if (
      !isRecord(record) ||
      record.projectRoot !== projectRoot ||
      record.workspaceId !== workspaceId
    ) {
      continue;
    }
    if (record.state === 'staging' || record.state === 'prepared') {
      await fs.remove(tx);
      continue;
    }
    if (manifest && record.generation === manifest.generation) {
      await fs.remove(tx);
      continue;
    }
    if (
      record.previousGeneration !== (manifest?.generation ?? null) ||
      record.state !== 'committing' ||
      !Array.isArray(record.paths) ||
      !isRecord(record.baselines) ||
      !isRecord(record.planned) ||
      !record.paths.every(
        path => typeof path === 'string' && isManagedRelativePath(path)
      )
    ) {
      continue;
    }
    for (const childPath of record.paths as string[]) {
      const target = await managedPath(mirrorPath, childPath);
      const backup = await safeChild(resolve(tx, 'backup'), childPath);
      const planned = record.planned[childPath];
      const current = await currentHash(target);
      if (current === planned || (current === null && planned === null)) {
        if (await fs.pathExists(backup)) {
          await fs.ensureDir(parse(target).dir);
          await atomicCopy(backup, target, async () => {
            if ((await currentHash(target)) !== planned) {
              throw new LocalMirrorRaceError(childPath);
            }
          });
        } else if (record.baselines[childPath] === null) {
          if ((await currentHash(target)) !== planned) {
            throw new LocalMirrorRaceError(childPath);
          }
          await fs.remove(target);
        }
      }
    }
    await fs.remove(tx);
    if (!manifest && record.previousGeneration === null) {
      for (const name of ['docs', 'snapshots', 'assets']) {
        await fs.rmdir(resolve(mirrorPath, name)).catch(error => {
          const code = (error as NodeJS.ErrnoException).code;
          if (code !== 'ENOENT' && code !== 'ENOTEMPTY') throw error;
        });
      }
      await fs.rmdir(mirrorPath).catch(error => {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT' && code !== 'ENOTEMPTY') throw error;
      });
    }
  }
}

function getLease(id: string, workspaceId: string, generation: string) {
  const lease = leases.get(id);
  if (
    !lease ||
    lease.aborted ||
    lease.workspaceId !== workspaceId ||
    lease.generation !== generation
  ) {
    throw new DOMException('Mirror generation aborted', 'AbortError');
  }
  return lease;
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
  const existingManifest = await loadManifest(mirrorPath);
  if (input.recoverInterrupted) {
    await recoverTransactions(
      projectRoot,
      mirrorPath,
      input.workspaceId,
      existingManifest
    );
  }
  if (!(await fs.pathExists(mirrorPath))) {
    return { state: 'empty' as const, projectRoot, mirrorPath, manifest: null };
  }
  const manifest = await loadManifest(mirrorPath);
  if (manifest && manifest.workspaceId !== input.workspaceId) {
    return { state: 'foreign' as const, projectRoot, mirrorPath, manifest };
  }
  const entries = await fs.readdir(mirrorPath);
  if (!manifest && entries.length > 0) {
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

export async function beginGeneration(input: {
  projectRoot: string;
  workspaceId: string;
  generation: string;
}) {
  const { mirrorPath, projectRoot } = await validateMirror(input.projectRoot);
  if (activeMirrors.has(mirrorPath)) {
    throw new Error('A mirror generation is already active');
  }
  const lease = nanoid();
  activeMirrors.set(mirrorPath, lease);
  let tx = '';
  let inspection: Awaited<ReturnType<typeof inspectTarget>>;
  try {
    inspection = await inspectTarget({
      ...input,
      recoverInterrupted: true,
    });
    if (inspection.state !== 'owned' && inspection.state !== 'empty') {
      throw new Error('Mirror target is not owned or empty');
    }
    const transactionRoot = await getTransactionRoot();
    tx = transactionPath(transactionRoot, lease);
    await fs.ensureDir(resolve(tx, 'staged'));
    await atomicWrite(
      resolve(tx, 'transaction.json'),
      `${JSON.stringify(
        {
          workspaceId: input.workspaceId,
          projectRoot,
          generation: input.generation,
          previousGeneration: inspection.manifest?.generation ?? null,
          state: 'staging',
          paths: [],
        } satisfies TransactionRecord,
        null,
        2
      )}\n`
    );
  } catch (error) {
    if (activeMirrors.get(mirrorPath) === lease)
      activeMirrors.delete(mirrorPath);
    if (tx) await fs.remove(tx).catch(() => undefined);
    throw error;
  }
  leases.set(lease, {
    id: lease,
    projectRoot,
    mirrorPath,
    workspaceId: input.workspaceId,
    generation: input.generation,
    previousGeneration: inspection.manifest?.generation ?? null,
    aborted: false,
    committing: false,
    txPath: tx,
  });
  return { lease };
}

export async function abortGeneration(input: { lease: string }) {
  const lease = leases.get(input.lease);
  if (!lease) return;
  lease.aborted = true;
  if (!lease.committing) {
    await removeTransaction(lease.txPath);
    leases.delete(lease.id);
    activeMirrors.delete(lease.mirrorPath);
  }
}

export async function writeBatch(input: {
  lease: string;
  projectRoot: string;
  workspaceId: string;
  generation: string;
  files: MirrorWriteFile[];
  replaceConflicts?: boolean;
}) {
  const lease = getLease(input.lease, input.workspaceId, input.generation);
  if (resolve(input.projectRoot) !== resolve(lease.projectRoot)) {
    throw new Error('Lease project mismatch');
  }
  let batchBytes = 0;
  const hashes: Record<string, string> = {};
  for (const file of input.files) {
    const size =
      typeof file.content === 'string'
        ? Buffer.byteLength(file.content)
        : file.content.byteLength;
    if (size > MAX_FILE_BYTES) throw new Error('Mirror file is too large');
    batchBytes += size;
    if (batchBytes > MAX_BATCH_BYTES)
      throw new Error('Mirror batch is too large');
    await managedPath(lease.mirrorPath, file.path);
    const staged = await safeChild(resolve(lease.txPath, 'staged'), file.path);
    getLease(input.lease, input.workspaceId, input.generation);
    await atomicWrite(staged, file.content);
    hashes[file.path] = sha256(file.content);
  }
  return { conflicts: [] as string[], hashes };
}

export async function finalizeGeneration(input: {
  lease: string;
  projectRoot: string;
  workspaceId: string;
  manifest: MirrorManifest;
  stalePaths: string[];
  replaceConflicts?: boolean;
}) {
  const lease = getLease(
    input.lease,
    input.workspaceId,
    input.manifest.generation
  );
  if (resolve(input.projectRoot) !== resolve(lease.projectRoot)) {
    throw new Error('Lease project mismatch');
  }
  const parsed = parseManifest(input.manifest);
  if (!parsed || parsed.workspaceId !== input.workspaceId) {
    throw new Error('Invalid mirror manifest');
  }
  const previous = await loadManifest(lease.mirrorPath);
  if (previous && previous.workspaceId !== input.workspaceId) {
    throw new Error('Mirror belongs to another workspace');
  }
  if ((previous?.generation ?? null) !== lease.previousGeneration) {
    throw new Error('Mirror changed after generation began');
  }
  const tx = lease.txPath;
  const stagedRoot = resolve(tx, 'staged');
  const allPaths = [
    ...new Set([...Object.keys(parsed.files), ...input.stalePaths]),
  ];
  for (const childPath of allPaths) {
    if (!isManagedRelativePath(childPath))
      throw new Error('Invalid manifest path');
  }
  const stagedPaths = new Set<string>();
  for (const [childPath, entry] of Object.entries(parsed.files)) {
    const staged = await safeChild(stagedRoot, childPath);
    const stagedHash = await currentHash(staged);
    if (stagedHash === entry.sha256) {
      stagedPaths.add(childPath);
      continue;
    }
    const live = await managedPath(lease.mirrorPath, childPath);
    if (
      stagedHash !== null ||
      previous?.files[childPath]?.sha256 !== entry.sha256 ||
      (await currentHash(live)) !== entry.sha256
    ) {
      throw new Error(`Staged mirror hash mismatch: ${childPath}`);
    }
  }

  if (!previous) {
    if (input.stalePaths.length > 0)
      throw new Error('Initial mirror has stale paths');
    const inspection = await inspectTarget({
      projectRoot: lease.projectRoot,
      workspaceId: input.workspaceId,
    });
    if (inspection.state !== 'empty')
      throw new Error('Mirror target is no longer empty');
    await validateMirror(lease.projectRoot, true);
  }
  const paths = [...new Set([...stagedPaths, ...input.stalePaths])];
  const conflicts: string[] = [];
  const baselines = new Map<string, string | null>();
  for (const childPath of paths) {
    const target = await managedPath(lease.mirrorPath, childPath);
    const existing = await currentHash(target);
    const baseline = previous?.files[childPath]?.sha256 ?? null;
    baselines.set(childPath, existing);
    const planned = parsed.files[childPath]?.sha256 ?? null;
    if (existing === baseline || existing === planned) continue;
    if (existing === null && baseline === null) continue;
    if (baseline === null || !input.replaceConflicts) conflicts.push(childPath);
  }
  if (conflicts.length) return { conflicts };

  const baselineRecord = Object.fromEntries(baselines);
  const plannedRecord = Object.fromEntries(
    paths.map(path => [path, parsed.files[path]?.sha256 ?? null])
  );
  const record: TransactionRecord = {
    workspaceId: input.workspaceId,
    projectRoot: lease.projectRoot,
    generation: parsed.generation,
    previousGeneration: previous?.generation ?? null,
    state: 'prepared',
    paths,
    baselines: baselineRecord,
    planned: plannedRecord,
  };
  const backupRoot = resolve(tx, 'backup');
  const mutated = new Set<string>();
  let committed = false;
  try {
    for (const childPath of paths) {
      getLease(input.lease, input.workspaceId, parsed.generation);
      const target = await managedPath(lease.mirrorPath, childPath);
      if ((await currentHash(target)) !== baselines.get(childPath)) {
        throw new LocalMirrorRaceError(childPath);
      }
      if (await fs.pathExists(target)) {
        const backup = await safeChild(backupRoot, childPath);
        await fs.ensureDir(parse(backup).dir);
        await fs.copy(target, backup, { overwrite: true });
        if (
          (await currentHash(backup)) !== baselines.get(childPath) ||
          (await currentHash(target)) !== baselines.get(childPath)
        ) {
          throw new LocalMirrorRaceError(childPath);
        }
      }
    }
    record.state = 'committing';
    await atomicWrite(
      resolve(tx, 'transaction.json'),
      `${JSON.stringify(record, null, 2)}\n`
    );
    lease.committing = true;
    for (const childPath of paths) {
      getLease(input.lease, input.workspaceId, parsed.generation);
      const target = await managedPath(lease.mirrorPath, childPath);
      if (parsed.files[childPath]) {
        const staged = await safeChild(stagedRoot, childPath);
        await fs.ensureDir(parse(target).dir);
        await atomicCopy(staged, target, async () => {
          getLease(input.lease, input.workspaceId, parsed.generation);
          if ((await currentHash(target)) !== baselines.get(childPath)) {
            throw new LocalMirrorRaceError(childPath);
          }
        });
      } else {
        if ((await currentHash(target)) !== baselines.get(childPath)) {
          throw new LocalMirrorRaceError(childPath);
        }
        await fs.remove(target);
      }
      mutated.add(childPath);
    }
    getLease(input.lease, input.workspaceId, parsed.generation);
    await atomicWrite(
      resolve(lease.mirrorPath, MANIFEST_FILE),
      `${JSON.stringify(parsed, null, 2)}\n`,
      () => {
        getLease(input.lease, input.workspaceId, parsed.generation);
      }
    );
    committed = true;
  } catch (error) {
    if (!committed)
      for (const childPath of mutated) {
        const target = await managedPath(lease.mirrorPath, childPath);
        const backup = await safeChild(backupRoot, childPath);
        const current = await currentHash(target);
        const planned = plannedRecord[childPath];
        if (current === planned || (current === null && planned === null)) {
          if (await fs.pathExists(backup)) {
            await atomicCopy(backup, target, async () => {
              if ((await currentHash(target)) !== planned) {
                throw new LocalMirrorRaceError(childPath);
              }
            });
          } else if (baselineRecord[childPath] === null) {
            if ((await currentHash(target)) !== planned) {
              throw new LocalMirrorRaceError(childPath);
            }
            await fs.remove(target);
          }
        }
      }
    await removeTransaction(lease.txPath);
    leases.delete(lease.id);
    activeMirrors.delete(lease.mirrorPath);
    throw error;
  }
  await removeTransaction(lease.txPath).catch(() => undefined);
  leases.delete(lease.id);
  activeMirrors.delete(lease.mirrorPath);
  return { conflicts: [] as string[] };
}

class LocalMirrorRaceError extends Error {
  constructor(path: string) {
    super(`Mirror file changed during commit: ${path}`);
  }
}

export async function revealMirror(input: {
  projectRoot: string;
  workspaceId: string;
}) {
  const inspection = await inspectTarget(input);
  if (inspection.state !== 'owned') {
    throw new Error('Mirror is not owned by this workspace');
  }
  await mainRPC.showItemInFolder(inspection.mirrorPath);
}
