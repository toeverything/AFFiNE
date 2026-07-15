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
  test('writes managed files and commits the manifest last', async () => {
    const batch = await writeBatch({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
      files: [{ path: 'index.md', kind: 'index', content: '# Workspace\n' }],
    });
    expect(batch.conflicts).toEqual([]);

    await finalizeGeneration({
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
    const first = await writeBatch({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
      files: [{ path: 'index.md', kind: 'index', content: 'original' }],
    });
    await finalizeGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-1', {
        'index.md': { kind: 'index', sha256: first.hashes['index.md'] },
      }),
      stalePaths: [],
    });
    await writeFile(join(projectRoot, '.affine', 'index.md'), 'local edit');

    const second = await writeBatch({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
      files: [{ path: 'index.md', kind: 'index', content: 'remote edit' }],
    });

    expect(second.conflicts).toEqual(['index.md']);
    expect(
      await readFile(join(projectRoot, '.affine', 'index.md'), 'utf8')
    ).toBe('local edit');
  });

  test('rejects traversal and foreign ownership', async () => {
    await expect(
      writeBatch({
        projectRoot,
        workspaceId: 'workspace-1',
        generation: 'generation-1',
        files: [{ path: '../escape.md', kind: 'markdown', content: 'escape' }],
      })
    ).rejects.toThrow('Invalid mirror file path');

    const first = await writeBatch({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
      files: [{ path: 'workspace.json', kind: 'workspace', content: '{}' }],
    });
    await finalizeGeneration({
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

  test('reveals only an owned or empty mirror', async () => {
    await revealMirror({ projectRoot, workspaceId: 'workspace-1' });
    expect(showItemInFolder).toHaveBeenCalledWith(join(projectRoot, '.affine'));
  });
});
