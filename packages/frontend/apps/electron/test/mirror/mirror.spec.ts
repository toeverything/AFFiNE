import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { getPath, showItemInFolder } = vi.hoisted(() => {
  const appDataRoot =
    process.platform === 'win32'
      ? 'C:\\affine-test-app-data'
      : '/affine-test-app-data';
  return {
    getPath: vi.fn(async (name: string) => `${appDataRoot}/${name}`),
    showItemInFolder: vi.fn(async () => undefined),
  };
});

vi.mock('@affine/electron/helper/main-rpc', () => ({
  mainRPC: {
    getPath,
    showItemInFolder,
    showOpenDialog: vi.fn(),
  },
}));

import {
  abortGeneration,
  beginGeneration,
  finalizeGeneration,
  inspectTarget,
  type MirrorManifest,
  revealMirror,
  writeBatch,
} from '@affine/electron/helper/mirror/mirror';

let projectRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'affine-mirror-test-'));
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
  vi.clearAllMocks();
});

function manifest(
  generation: string,
  files: MirrorManifest['files']
): MirrorManifest {
  return {
    formatVersion: 1,
    workspaceId: 'workspace-1',
    workspaceFlavour: 'affine',
    generation,
    lastCompletedAt: new Date(0).toISOString(),
    sourceSyncState: 'synced',
    files,
  };
}

describe('local mirror helper', () => {
  test('allows only one active generation per mirror', async () => {
    const first = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
    });
    await expect(
      beginGeneration({
        projectRoot,
        workspaceId: 'workspace-1',
        generation: 'generation-2',
      })
    ).rejects.toThrow('already active');
    const batch = await writeBatch({
      lease: first.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
      files: [{ path: 'index.md', kind: 'index', content: 'survived' }],
    });
    await finalizeGeneration({
      lease: first.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-1', {
        'index.md': { kind: 'index', sha256: batch.hashes['index.md'] },
      }),
      stalePaths: [],
    });
    expect(
      await readFile(join(projectRoot, '.affine', 'index.md'), 'utf8')
    ).toBe('survived');
  });

  test('retains verified unchanged files during an incremental generation', async () => {
    const firstLease = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
    });
    const first = await writeBatch({
      lease: firstLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
      files: [
        { path: 'index.md', kind: 'index', content: 'first' },
        { path: 'workspace.json', kind: 'workspace', content: '{}' },
      ],
    });
    await finalizeGeneration({
      lease: firstLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-1', {
        'index.md': { kind: 'index', sha256: first.hashes['index.md'] },
        'workspace.json': {
          kind: 'workspace',
          sha256: first.hashes['workspace.json'],
        },
      }),
      stalePaths: [],
    });

    const secondLease = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
    });
    const second = await writeBatch({
      lease: secondLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
      files: [{ path: 'index.md', kind: 'index', content: 'second' }],
    });
    await finalizeGeneration({
      lease: secondLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-2', {
        'index.md': { kind: 'index', sha256: second.hashes['index.md'] },
        'workspace.json': {
          kind: 'workspace',
          sha256: first.hashes['workspace.json'],
        },
      }),
      stalePaths: [],
    });

    expect(
      await readFile(join(projectRoot, '.affine', 'index.md'), 'utf8')
    ).toBe('second');
    expect(
      await readFile(join(projectRoot, '.affine', 'workspace.json'), 'utf8')
    ).toBe('{}');
  });

  test('writes managed files and commits the manifest last', async () => {
    const { lease } = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
    });
    const batch = await writeBatch({
      lease,
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
      files: [{ path: 'index.md', kind: 'index', content: '# Workspace\n' }],
    });
    expect(batch.conflicts).toEqual([]);

    await finalizeGeneration({
      lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-1', {
        'index.md': { kind: 'index', sha256: batch.hashes['index.md'] },
      }),
      stalePaths: [],
    });

    const inspection = await inspectTarget({
      projectRoot,
      workspaceId: 'workspace-1',
    });
    expect(inspection.state).toBe('owned');
    expect(
      await readFile(join(projectRoot, '.affine', 'index.md'), 'utf8')
    ).toBe('# Workspace\n');
    expect(inspection.manifest?.generation).toBe('generation-1');
  });

  test('preserves locally modified managed files', async () => {
    const firstLease = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
    });
    const first = await writeBatch({
      lease: firstLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
      files: [{ path: 'index.md', kind: 'index', content: 'original' }],
    });
    await finalizeGeneration({
      lease: firstLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-1', {
        'index.md': { kind: 'index', sha256: first.hashes['index.md'] },
      }),
      stalePaths: [],
    });
    await writeFile(join(projectRoot, '.affine', 'index.md'), 'local edit');

    const secondLease = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
    });
    const second = await writeBatch({
      lease: secondLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
      files: [{ path: 'index.md', kind: 'index', content: 'remote edit' }],
    });

    const result = await finalizeGeneration({
      lease: secondLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-2', {
        'index.md': { kind: 'index', sha256: second.hashes['index.md'] },
      }),
      stalePaths: [],
    });
    expect(result.conflicts).toEqual(['index.md']);
    expect(
      await readFile(join(projectRoot, '.affine', 'index.md'), 'utf8')
    ).toBe('local edit');
  });

  test('rejects traversal and foreign ownership', async () => {
    const invalidLease = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'invalid-generation',
    });
    await expect(
      writeBatch({
        lease: invalidLease.lease,
        projectRoot,
        workspaceId: 'workspace-1',
        generation: 'invalid-generation',
        files: [{ path: '../escape.md', kind: 'markdown', content: 'escape' }],
      })
    ).rejects.toThrow('Invalid mirror file path');
    await abortGeneration({ lease: invalidLease.lease });

    const firstLease = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
    });
    const first = await writeBatch({
      lease: firstLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
      files: [{ path: 'workspace.json', kind: 'workspace', content: '{}' }],
    });
    await finalizeGeneration({
      lease: firstLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-1', {
        'workspace.json': {
          kind: 'workspace',
          sha256: first.hashes['workspace.json'],
        },
      }),
      stalePaths: [],
    });
    expect(
      (
        await inspectTarget({
          projectRoot,
          workspaceId: 'workspace-2',
        })
      ).state
    ).toBe('foreign');
  });

  test('rejects a symlinked mirror directory', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'affine-mirror-outside-'));
    try {
      await symlink(
        outside,
        join(projectRoot, '.affine'),
        process.platform === 'win32' ? 'junction' : 'dir'
      );
      await expect(
        inspectTarget({ projectRoot, workspaceId: 'workspace-1' })
      ).rejects.toThrow('must not be a symlink');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  test('reveals only an owned mirror', async () => {
    await expect(
      revealMirror({ projectRoot, workspaceId: 'workspace-1' })
    ).rejects.toThrow('not owned');
    expect(showItemInFolder).not.toHaveBeenCalled();
  });
});
