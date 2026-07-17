import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { appPathState, getPath, showItemInFolder } = vi.hoisted(() => {
  const appDataRoot =
    process.platform === 'win32'
      ? 'C:\\affine-test-app-data'
      : '/affine-test-app-data';
  const appPathState = { root: appDataRoot };
  return {
    appPathState,
    getPath: vi.fn(async (name: string) => `${appPathState.root}/${name}`),
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
let appDataRoot: string;

beforeEach(async () => {
  projectRoot = await mkdtemp(join(tmpdir(), 'affine-mirror-test-'));
  appDataRoot = await mkdtemp(join(tmpdir(), 'affine-mirror-app-data-'));
  appPathState.root = appDataRoot;
});

afterEach(async () => {
  await rm(projectRoot, { recursive: true, force: true });
  await rm(appDataRoot, { recursive: true, force: true });
  vi.clearAllMocks();
});

function hash(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

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
    expect(
      JSON.parse(
        await readFile(
          join(projectRoot, '.affine', '.metadata', 'mirror.json'),
          'utf8'
        )
      ).generation
    ).toBe('generation-1');
  });

  test('migrates the legacy root layout into the internal metadata directory', async () => {
    const mirrorPath = join(projectRoot, '.affine');
    const legacyDoc = 'legacy markdown';
    const legacyWorkspace = '{}\n';
    const legacyManifest = manifest('legacy-generation', {
      'docs/doc-id.md': {
        kind: 'markdown',
        sha256: hash(legacyDoc),
        docId: 'doc-id',
      },
      'workspace.json': {
        kind: 'workspace',
        sha256: hash(legacyWorkspace),
      },
    });
    await mkdir(join(mirrorPath, 'docs'), { recursive: true });
    await writeFile(join(mirrorPath, 'docs', 'doc-id.md'), legacyDoc);
    await writeFile(join(mirrorPath, 'workspace.json'), legacyWorkspace);
    await writeFile(
      join(mirrorPath, 'mirror.json'),
      `${JSON.stringify(legacyManifest)}\n`
    );

    const { lease } = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
    });
    const files = [
      {
        path: 'docs/Readable-title.md',
        kind: 'markdown' as const,
        content: 'readable markdown',
        docId: 'doc-id',
      },
      {
        path: '.metadata/workspace.json',
        kind: 'workspace' as const,
        content: legacyWorkspace,
      },
      {
        path: '.metadata/snapshots/doc-id.snapshot.json',
        kind: 'snapshot' as const,
        content: '{"id":"doc-id"}\n',
        docId: 'doc-id',
      },
    ];
    const batch = await writeBatch({
      lease,
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
      files,
    });
    await finalizeGeneration({
      lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest(
        'generation-2',
        Object.fromEntries(
          files.map(file => [
            file.path,
            {
              kind: file.kind,
              sha256: batch.hashes[file.path],
              docId: file.docId,
            },
          ])
        )
      ),
      stalePaths: ['docs/doc-id.md', 'workspace.json'],
    });

    expect(
      await readFile(join(mirrorPath, 'docs', 'Readable-title.md'), 'utf8')
    ).toBe('readable markdown');
    expect(
      await readFile(join(mirrorPath, '.metadata', 'workspace.json'), 'utf8')
    ).toBe(legacyWorkspace);
    await expect(
      readFile(join(mirrorPath, 'mirror.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(join(mirrorPath, 'docs', 'doc-id.md'))
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('preserves a legacy manifest changed while migration is running', async () => {
    const mirrorPath = join(projectRoot, '.affine');
    const legacyManifest = manifest('legacy-generation', {});
    await mkdir(mirrorPath, { recursive: true });
    await writeFile(
      join(mirrorPath, 'mirror.json'),
      JSON.stringify(legacyManifest)
    );

    const { lease } = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
    });
    const locallyReformatted = `${JSON.stringify(legacyManifest, null, 2)}\n`;
    await writeFile(join(mirrorPath, 'mirror.json'), locallyReformatted);
    const batch = await writeBatch({
      lease,
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
      files: [{ path: 'index.md', kind: 'index', content: '# Workspace\n' }],
    });
    await finalizeGeneration({
      lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-2', {
        'index.md': { kind: 'index', sha256: batch.hashes['index.md'] },
      }),
      stalePaths: [],
    });

    expect(await readFile(join(mirrorPath, 'mirror.json'), 'utf8')).toBe(
      locallyReformatted
    );
  });

  test('does not remove an unmanaged root mirror.json after migration', async () => {
    const mirrorPath = join(projectRoot, '.affine');
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
      files: [{ path: 'index.md', kind: 'index', content: 'first' }],
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
    await writeFile(join(mirrorPath, 'mirror.json'), 'user file');

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
      }),
      stalePaths: [],
    });

    expect(await readFile(join(mirrorPath, 'mirror.json'), 'utf8')).toBe(
      'user file'
    );
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

  test('preserves a locally modified stale file until replacement is explicit', async () => {
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
      files: [{ path: 'docs/page.md', kind: 'markdown', content: 'original' }],
    });
    await finalizeGeneration({
      lease: firstLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-1', {
        'docs/page.md': {
          kind: 'markdown',
          sha256: first.hashes['docs/page.md'],
        },
      }),
      stalePaths: [],
    });
    await writeFile(join(projectRoot, '.affine', 'docs', 'page.md'), 'local');
    await writeFile(join(projectRoot, '.affine', 'notes.txt'), 'unknown');

    const conflictingLease = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
    });
    const conflict = await finalizeGeneration({
      lease: conflictingLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-2', {}),
      stalePaths: ['docs/page.md'],
    });
    expect(conflict.conflicts).toEqual(['docs/page.md']);
    expect(
      await readFile(join(projectRoot, '.affine', 'docs', 'page.md'), 'utf8')
    ).toBe('local');
    expect(
      await readFile(join(projectRoot, '.affine', 'notes.txt'), 'utf8')
    ).toBe('unknown');
    await abortGeneration({ lease: conflictingLease.lease });

    const replacementLease = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
    });
    await expect(
      finalizeGeneration({
        lease: replacementLease.lease,
        projectRoot,
        workspaceId: 'workspace-1',
        manifest: manifest('generation-2', {}),
        stalePaths: ['docs/page.md'],
        replaceConflicts: true,
      })
    ).resolves.toEqual({ conflicts: [] });
    await expect(
      readFile(join(projectRoot, '.affine', 'docs', 'page.md'), 'utf8')
    ).rejects.toMatchObject({ code: 'ENOENT' });
    expect(
      await readFile(join(projectRoot, '.affine', 'notes.txt'), 'utf8')
    ).toBe('unknown');
  });

  test('recovers an interrupted initial commit without publishing a partial mirror', async () => {
    const mirrorPath = join(projectRoot, '.affine');
    const transactionPath = join(
      appDataRoot,
      'sessionData',
      'local-mirror-transactions',
      'interrupted-initial'
    );
    await mkdir(transactionPath, { recursive: true });
    await mkdir(mirrorPath, { recursive: true });
    await writeFile(join(mirrorPath, 'index.md'), 'partial');
    await mkdir(join(mirrorPath, '.metadata', 'snapshots'), {
      recursive: true,
    });
    await writeFile(
      join(mirrorPath, '.metadata', 'snapshots', 'doc.snapshot.json'),
      'partial snapshot'
    );
    await writeFile(
      join(transactionPath, 'transaction.json'),
      JSON.stringify({
        workspaceId: 'workspace-1',
        projectRoot,
        generation: 'generation-1',
        previousGeneration: null,
        state: 'committing',
        paths: ['index.md', '.metadata/snapshots/doc.snapshot.json'],
        baselines: {
          'index.md': null,
          '.metadata/snapshots/doc.snapshot.json': null,
        },
        planned: {
          'index.md': hash('partial'),
          '.metadata/snapshots/doc.snapshot.json': hash('partial snapshot'),
        },
      })
    );

    const inspection = await inspectTarget({
      projectRoot,
      workspaceId: 'workspace-1',
      recoverInterrupted: true,
    });

    expect(inspection.state).toBe('empty');
    await expect(readFile(join(mirrorPath, 'index.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(mirrorPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  test('preserves the previous generation when manifest replacement fails', async () => {
    const firstLease = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
    });
    const firstBatch = await writeBatch({
      lease: firstLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
      files: [{ path: 'index.md', kind: 'index', content: 'first' }],
    });
    await finalizeGeneration({
      lease: firstLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-1', {
        'index.md': { kind: 'index', sha256: firstBatch.hashes['index.md'] },
      }),
      stalePaths: [],
    });

    const secondLease = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
    });
    const secondBatch = await writeBatch({
      lease: secondLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-2',
      files: [{ path: 'index.md', kind: 'index', content: 'second' }],
    });
    const rename = fs.rename.bind(fs);
    const renameSpy = vi.spyOn(fs, 'rename').mockImplementation((from, to) => {
      if (String(to).endsWith(join('.metadata', 'mirror.json'))) {
        return Promise.reject(
          new Error('simulated manifest replacement failure')
        );
      }
      return rename(from, to);
    });

    await expect(
      finalizeGeneration({
        lease: secondLease.lease,
        projectRoot,
        workspaceId: 'workspace-1',
        manifest: manifest('generation-2', {
          'index.md': {
            kind: 'index',
            sha256: secondBatch.hashes['index.md'],
          },
        }),
        stalePaths: [],
      })
    ).rejects.toThrow('simulated manifest replacement failure');
    renameSpy.mockRestore();

    expect(
      JSON.parse(
        await readFile(
          join(projectRoot, '.affine', '.metadata', 'mirror.json'),
          'utf8'
        )
      ).generation
    ).toBe('generation-1');
    expect(
      await readFile(join(projectRoot, '.affine', 'index.md'), 'utf8')
    ).toBe('first');
  });

  test('rejects an oversized file before writing it to the transaction', async () => {
    const { lease } = await beginGeneration({
      projectRoot,
      workspaceId: 'workspace-1',
      generation: 'generation-1',
    });
    const oversized = {
      byteLength: 128 * 1024 * 1024 + 1,
    } as Uint8Array;

    await expect(
      writeBatch({
        lease,
        projectRoot,
        workspaceId: 'workspace-1',
        generation: 'generation-1',
        files: [
          {
            path: '.metadata/assets/large.bin',
            kind: 'asset',
            content: oversized,
          },
        ],
      })
    ).rejects.toThrow('Mirror file is too large');
    await abortGeneration({ lease });
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
      files: [
        {
          path: '.metadata/workspace.json',
          kind: 'workspace',
          content: '{}',
        },
      ],
    });
    await finalizeGeneration({
      lease: firstLease.lease,
      projectRoot,
      workspaceId: 'workspace-1',
      manifest: manifest('generation-1', {
        '.metadata/workspace.json': {
          kind: 'workspace',
          sha256: first.hashes['.metadata/workspace.json'],
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

  test('rejects a symlinked internal metadata directory', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'affine-metadata-outside-'));
    try {
      const mirrorPath = join(projectRoot, '.affine');
      await mkdir(mirrorPath, { recursive: true });
      await symlink(
        outside,
        join(mirrorPath, '.metadata'),
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

  test.runIf(process.env.RUN_LOCAL_MIRROR_BENCH === '1')(
    'records representative streamed workspace performance',
    async () => {
      const tiers = [
        { name: 'small', docs: 25 },
        { name: 'medium', docs: 250 },
        { name: 'large', docs: 1000 },
      ];
      const markdown = 'm'.repeat(8 * 1024);
      const snapshot = 's'.repeat(32 * 1024);
      const asset = new Uint8Array(1024 * 1024);

      for (const tier of tiers) {
        const tierRoot = join(projectRoot, tier.name);
        await mkdir(tierRoot, { recursive: true });
        const initialFiles: MirrorManifest['files'] = {};
        let totalBytes = 0;
        let maxPayloadBytes = 0;
        const rssBefore = process.memoryUsage().rss;
        let peakRss = rssBefore;
        const initialStartedAt = performance.now();
        const initial = await beginGeneration({
          projectRoot: tierRoot,
          workspaceId: 'workspace-1',
          generation: 'generation-1',
        });

        const writeOne = async (
          path: string,
          kind: 'index' | 'workspace' | 'markdown' | 'snapshot' | 'asset',
          content: string | Uint8Array
        ) => {
          const bytes =
            typeof content === 'string'
              ? Buffer.byteLength(content)
              : content.byteLength;
          totalBytes += bytes;
          maxPayloadBytes = Math.max(maxPayloadBytes, bytes);
          const result = await writeBatch({
            lease: initial.lease,
            projectRoot: tierRoot,
            workspaceId: 'workspace-1',
            generation: 'generation-1',
            files: [{ path, kind, content }],
          });
          initialFiles[path] = { kind, sha256: result.hashes[path] };
          peakRss = Math.max(peakRss, process.memoryUsage().rss);
        };

        const documentIds = Array.from(
          { length: tier.docs },
          (_, index) => `doc-${index}`
        );
        await writeOne(
          'index.md',
          'index',
          documentIds.map(id => `- [${id}](./docs/${id}.md)`).join('\n') + '\n'
        );
        await writeOne(
          '.metadata/workspace.json',
          'workspace',
          `${JSON.stringify({
            formatVersion: 1,
            workspaceId: 'workspace-1',
            documents: documentIds.map(id => ({
              id,
              markdownPath: `docs/${id}.md`,
              snapshotPath: `.metadata/snapshots/${id}.snapshot.json`,
            })),
          })}\n`
        );
        for (let index = 0; index < tier.docs; index++) {
          await writeOne(`docs/doc-${index}.md`, 'markdown', markdown);
          await writeOne(
            `.metadata/snapshots/doc-${index}.snapshot.json`,
            'snapshot',
            snapshot
          );
          if (index % 10 === 0) {
            await writeOne(
              `.metadata/assets/asset-${index}.bin`,
              'asset',
              asset
            );
          }
        }
        await finalizeGeneration({
          lease: initial.lease,
          projectRoot: tierRoot,
          workspaceId: 'workspace-1',
          manifest: manifest('generation-1', initialFiles),
          stalePaths: [],
        });
        const initialMs = performance.now() - initialStartedAt;

        const incrementalStartedAt = performance.now();
        const incremental = await beginGeneration({
          projectRoot: tierRoot,
          workspaceId: 'workspace-1',
          generation: 'generation-2',
        });
        const incrementalFiles = structuredClone(initialFiles);
        for (let index = 0; index < Math.min(10, tier.docs); index++) {
          const path = `docs/doc-${index}.md`;
          const changed = `${markdown.slice(0, -1)}${index % 10}`;
          const result = await writeBatch({
            lease: incremental.lease,
            projectRoot: tierRoot,
            workspaceId: 'workspace-1',
            generation: 'generation-2',
            files: [{ path, kind: 'markdown', content: changed }],
          });
          incrementalFiles[path] = {
            kind: 'markdown',
            sha256: result.hashes[path],
          };
          peakRss = Math.max(peakRss, process.memoryUsage().rss);
        }
        await finalizeGeneration({
          lease: incremental.lease,
          projectRoot: tierRoot,
          workspaceId: 'workspace-1',
          manifest: manifest('generation-2', incrementalFiles),
          stalePaths: [],
        });
        const incrementalMs = performance.now() - incrementalStartedAt;
        const inspection = await inspectTarget({
          projectRoot: tierRoot,
          workspaceId: 'workspace-1',
        });

        expect(inspection.manifest?.generation).toBe('generation-2');
        expect(Object.keys(inspection.manifest?.files ?? {})).toHaveLength(
          Object.keys(initialFiles).length
        );
        expect(maxPayloadBytes).toBe(1024 * 1024);
        console.info(
          `LOCAL_MIRROR_BENCH ${JSON.stringify({
            tier: tier.name,
            documents: tier.docs,
            files: Object.keys(initialFiles).length,
            totalBytes,
            maxPayloadBytes,
            initialMs: Math.round(initialMs),
            incremental10DocsMs: Math.round(incrementalMs),
            peakRssBytes: peakRss,
            rssDeltaBytes: Math.max(0, peakRss - rssBefore),
          })}`
        );
      }
    },
    10 * 60 * 1000
  );
});
