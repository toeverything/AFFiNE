/** @vitest-environment happy-dom */

import { describe, expect, test, vi } from 'vitest';

import { CollectionService } from '../../collection';
import { DocsService } from '../../doc';
import { GuardService } from '../../permissions';
import { TagService } from '../../tag';
import type { WorkspaceMetadata, WorkspacesService } from '../../workspace';
import { ImportClipperService, type ShareImportInput } from './import';
import { shareImportBlockIds } from './share-block-plan';
import {
  createShareImportReceipt,
  decideShareImportRecovery,
  parseShareImportReceipt,
  serializeShareImportReceipt,
} from './share-import-receipt';

vi.mock('@affine/core/blocksuite/manager/view', () => ({
  createBlockStdScope: () => ({
    get: () => ({ getEmbedBlockOptions: () => null }),
  }),
}));

describe('share import receipt', () => {
  test.each(['preparing', 'committed'] as const)(
    'round-trips the canonical %s fixture',
    state => {
      const receipt = createShareImportReceipt({
        attemptId: 'attempt-id',
        state,
      });
      const serialized = serializeShareImportReceipt(receipt);
      expect(serialized).toBe(
        `{"version":1,"attemptId":"attempt-id","state":"${state}"}`
      );
      expect(parseShareImportReceipt(serialized)).toEqual(receipt);
      expect(
        parseShareImportReceipt(
          JSON.stringify({ ...receipt, unexpected: true })
        )
      ).toBeUndefined();
    }
  );

  test.each([
    undefined,
    '',
    '{',
    JSON.stringify({ version: 2, status: 'preparing' }),
    JSON.stringify({ version: 1, status: 'committed' }),
    JSON.stringify({
      version: 1,
      documentId: 'document-id',
      importAttemptId: 'attempt-id',
      status: 'committed',
    }),
    JSON.stringify({
      version: 1,
      documentId: 'document-id',
      importAttemptId: 'attempt-id',
      status: 'unknown',
    }),
  ])('rejects malformed or unsupported persisted values %#', value => {
    expect(parseShareImportReceipt(value)).toBeUndefined();
  });

  test.each([
    [
      'no document and no receipt',
      undefined,
      false,
      'write-preparing-and-create',
    ],
    [
      'crash after receipt before createDoc',
      'preparing',
      false,
      'create-from-preparing',
    ],
    [
      'root record with an empty content doc',
      'preparing',
      true,
      'resume-preparing',
    ],
    ['committed retry', 'committed', true, 'committed-replay'],
    [
      'committed receipt without a document',
      'committed',
      false,
      'import-conflict',
    ],
  ] as const)(
    'decides recovery for %s',
    (_name, state, documentExists, expected) => {
      const receipt = state
        ? serializeShareImportReceipt(
            createShareImportReceipt({
              attemptId: 'attempt-id',
              state,
            })
          )
        : undefined;
      expect(
        decideShareImportRecovery({
          receiptValue: receipt,
          expectedAttemptId: 'attempt-id',
          documentExists,
        })
      ).toBe(expected);
    }
  );

  test.each([
    ['malformed receipt', '{', false],
    ['future receipt', JSON.stringify({ version: 2 }), false],
    [
      'different attempt',
      JSON.stringify({
        version: 1,
        attemptId: 'other',
        state: 'preparing',
      }),
      false,
    ],
    ['existing document without receipt', undefined, true],
  ])(
    'does not mutate a conflict from %s',
    (_name, receiptValue, documentExists) => {
      expect(
        decideShareImportRecovery({
          receiptValue,
          expectedAttemptId: 'attempt-id',
          documentExists,
        })
      ).toBe('import-conflict');
    }
  );
});

function input(importAttemptId = 'attempt-id'): ShareImportInput {
  return {
    documentId: 'document-id',
    importAttemptId,
    title: 'Shared',
    content: { kind: 'url', url: 'https://example.com' },
    tagIds: [],
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function makeQueuedImportService(
  importShareToWorkspaceUnlocked: (
    workspaceMetadata: WorkspaceMetadata,
    input: ShareImportInput
  ) => Promise<{ status: 'imported'; docId: string }>
) {
  return Object.assign(Object.create(ImportClipperService.prototype), {
    shareImportTails: new Map(),
    importShareToWorkspaceUnlocked,
  }) as ImportClipperService;
}

function makeImportHarness({
  receipt,
  recordExists = false,
  blocks = [],
  failAfterBlockId,
  workspaceId = 'workspace-id',
}: {
  receipt?: string;
  recordExists?: boolean;
  blocks?: { id: string; flavour: string; parentId?: string }[];
  failAfterBlockId?: string;
  workspaceId?: string;
} = {}) {
  const events: string[] = [];
  type HarnessModel = {
    id: string;
    flavour: string;
    parent?: HarnessModel;
    children: HarnessModel[];
    props: Record<string, unknown>;
  };
  const models = new Map<string, HarnessModel>();
  for (const block of blocks) {
    const parent = block.parentId ? models.get(block.parentId) : undefined;
    const model: HarnessModel = {
      id: block.id,
      flavour: block.flavour,
      parent,
      children: [],
      props: {},
    };
    models.set(block.id, model);
    parent?.children.push(model);
  }
  let didInjectBlockFailure = false;
  const blockSuiteDoc = {
    getBlock: (id: string) => {
      const model = models.get(id);
      return model ? { id, model } : undefined;
    },
    getBlocksByFlavour: (flavour: string) =>
      [...models.values()]
        .filter(model => model.flavour === flavour)
        .map(model => ({ id: model.id, model })),
    addBlock: (
      flavour: string,
      props: { id: string } & Record<string, unknown>,
      parentId?: string,
      parentIndex?: number
    ) => {
      events.push(`add:${flavour}:${props.id}`);
      const id = props.id;
      const storedProps =
        flavour === 'affine:page'
          ? {
              ...props,
              title: {
                value: '',
                get length() {
                  return this.value.length;
                },
                toString() {
                  return this.value;
                },
                delete() {
                  this.value = '';
                },
                insert(value: string) {
                  this.value = value;
                },
              },
            }
          : props;
      const parent = parentId ? models.get(parentId) : undefined;
      const model: HarnessModel = {
        id,
        flavour,
        parent,
        children: [],
        props: storedProps,
      };
      models.set(id, model);
      if (parent) {
        parent.children.splice(parentIndex ?? parent.children.length, 0, model);
      }
      if (!didInjectBlockFailure && id === failAfterBlockId) {
        didInjectBlockFailure = true;
        throw new Error(`Injected failure after ${id}`);
      }
      return id;
    },
  };
  const record = {
    id: 'document-id',
    meta$: { value: { tags: [] as string[], title: '' } },
    setMeta: vi.fn((meta: { title: string }) => {
      record.meta$.value = { ...record.meta$.value, ...meta };
    }),
  };
  let currentRecord: typeof record | undefined = recordExists
    ? record
    : undefined;
  let receiptValue = receipt;
  const docs = {
    list: { doc$: vi.fn(() => ({ value: currentRecord })) },
    getCustomPropertyById: vi.fn(() => receiptValue),
    setCustomPropertyById: vi.fn((_id, _property, value: string) => {
      events.push('receipt:set');
      events.push(`receipt:${parseShareImportReceipt(value)?.state}`);
      receiptValue = value;
    }),
    createDoc: vi.fn((options: { id: string; skipInit: boolean }) => {
      events.push(`create:${options.id}:${options.skipInit}`);
      currentRecord = record;
      return record;
    }),
    open: vi.fn(() => ({
      doc: {
        waitForSyncReady: vi.fn(async () => events.push('doc:ready')),
        blockSuiteDoc,
      },
      release: vi.fn(),
    })),
  };
  const engine = {
    addPriority: vi.fn((id: string) => {
      events.push(`priority:${id}`);
      return vi.fn();
    }),
    waitForDocReady: vi.fn(async (id: string) => events.push(`ready:${id}`)),
    waitForDocLoaded: vi.fn(async (id: string) => events.push(`loaded:${id}`)),
    waitForUpdated: vi.fn(async (id: string) => {
      events.push(`updated:${id}`);
    }),
    waitForSynced: vi.fn(async (id: string) => events.push(`synced:${id}`)),
  };
  const guard = { can: vi.fn(async () => true) };
  const tag = { tag: vi.fn() };
  const tagService = {
    tagList: {
      tags$: { value: [] },
      tagByTagId$: vi.fn(() => ({ value: tag })),
    },
  };
  const collectionService = {
    collectionMetas$: { value: [] },
    addDocToCollection: vi.fn(),
  };
  const blobSet = vi.fn(async () => 'blob-id');
  const workspace = {
    id: workspaceId,
    meta: { flavour: 'server' },
    engine: { doc: engine },
    docCollection: { blobSync: { set: blobSet } },
    scope: {
      get: (token: unknown) => {
        if (token === DocsService) return docs;
        if (token === GuardService) return guard;
        if (token === TagService) return tagService;
        if (token === CollectionService) return collectionService;
        throw new Error('Unexpected service token');
      },
    },
  };
  const metadata = {
    id: workspaceId,
    flavour: 'server',
  } as WorkspaceMetadata;
  const waitForRevalidation = vi.fn(async () => events.push('revalidate'));
  const getWorkspaceProfile = vi.fn(async () => ({}));
  const workspaces = {
    list: { workspaces$: { value: [metadata] }, waitForRevalidation },
    getWorkspaceFlavourProvider: vi.fn(() => ({ getWorkspaceProfile })),
    open: vi.fn(() => ({ workspace, dispose: vi.fn() })),
  } as unknown as WorkspacesService;

  return {
    events,
    blocks: models,
    addBlock: blockSuiteDoc.addBlock,
    removeBlock(id: string) {
      const model = models.get(id);
      if (!model) return;
      const index = model.parent?.children.indexOf(model) ?? -1;
      if (index >= 0) model.parent?.children.splice(index, 1);
      models.delete(id);
    },
    docs,
    record,
    engine,
    guard,
    tagService,
    collectionService,
    blobSet,
    waitForRevalidation,
    getWorkspaceProfile,
    service: Object.assign(Object.create(ImportClipperService.prototype), {
      workspacesService: workspaces,
      shareImportTails: new Map(),
    }) as ImportClipperService,
    metadata,
  };
}

describe('share import orchestration', () => {
  test('imports non-URL content with an unparseable source URL', async () => {
    const harness = makeImportHarness();
    const ids = shareImportBlockIds('attempt-id');

    await expect(
      harness.service.importShareToWorkspace(
        harness.metadata,
        {
          ...input(),
          title: '   ',
          content: {
            kind: 'text',
            text: 'Shared text',
            url: 'not an absolute URL',
          },
        },
        { allowOffline: true }
      )
    ).resolves.toEqual({ status: 'imported', docId: 'document-id' });
    expect(harness.blocks.get(ids.sourceLink)?.props).toMatchObject({
      url: 'not an absolute URL',
      title: 'not an absolute URL',
    });
  });

  test('queues A, B, C, and a post-release D for one workspace document without overlap', async () => {
    const gates = new Map(
      ['A', 'B', 'C', 'D'].map(label => [label, deferred()])
    );
    const started: string[] = [];
    let active = 0;
    let maxActive = 0;
    const service = makeQueuedImportService(async (_, currentInput) => {
      const label = currentInput.importAttemptId;
      started.push(label);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await gates.get(label)?.promise;
      active -= 1;
      return { status: 'imported', docId: currentInput.documentId };
    });
    const metadata = {
      id: 'workspace-id',
      flavour: 'server',
    } as WorkspaceMetadata;

    const a = service.importShareToWorkspace(metadata, input('A'));
    await vi.waitFor(() => expect(started).toEqual(['A']));
    const b = service.importShareToWorkspace(metadata, input('B'));
    const c = service.importShareToWorkspace(metadata, input('C'));
    gates.get('A')?.resolve();
    await vi.waitFor(() => expect(started).toEqual(['A', 'B']));
    const d = service.importShareToWorkspace(metadata, input('D'));

    gates.get('B')?.resolve();
    await vi.waitFor(() => expect(started).toEqual(['A', 'B', 'C']));
    gates.get('C')?.resolve();
    await vi.waitFor(() => expect(started).toEqual(['A', 'B', 'C', 'D']));
    gates.get('D')?.resolve();
    await Promise.all([a, b, c, d]);

    expect(maxActive).toBe(1);
  });

  test.each([
    ['workspace-id', 'document-id', 'other-workspace-id', 'document-id'],
    ['workspace-id', 'document-id', 'workspace-id', 'other-document-id'],
    ['workspace:document', 'id', 'workspace', 'document:id'],
  ])(
    'runs distinct keys independently: %s / %s and %s / %s',
    async (firstWorkspace, firstDoc, secondWorkspace, secondDoc) => {
      const firstGate = deferred();
      const started: string[] = [];
      const service = makeQueuedImportService(
        async (_metadata, currentInput) => {
          started.push(currentInput.importAttemptId);
          if (currentInput.importAttemptId === 'A') {
            await firstGate.promise;
          }
          return { status: 'imported', docId: currentInput.documentId };
        }
      );
      const a = service.importShareToWorkspace(
        { id: firstWorkspace, flavour: 'server' } as WorkspaceMetadata,
        { ...input('A'), documentId: firstDoc }
      );
      await vi.waitFor(() => expect(started).toEqual(['A']));
      const b = service.importShareToWorkspace(
        { id: secondWorkspace, flavour: 'server' } as WorkspaceMetadata,
        { ...input('B'), documentId: secondDoc }
      );
      await expect(b).resolves.toEqual({
        status: 'imported',
        docId: secondDoc,
      });
      expect(started).toEqual(['A', 'B']);
      firstGate.resolve();
      await a;
    }
  );

  test('confirmed offline import uses only loaded local state and local update waits', async () => {
    const harness = makeImportHarness();

    await expect(
      harness.service.importShareToWorkspace(harness.metadata, input(), {
        allowOffline: true,
      })
    ).resolves.toEqual({ status: 'imported', docId: 'document-id' });

    expect(harness.waitForRevalidation).not.toHaveBeenCalled();
    expect(harness.getWorkspaceProfile).not.toHaveBeenCalled();
    expect(harness.engine.waitForSynced).not.toHaveBeenCalled();
    expect(harness.engine.waitForDocLoaded).toHaveBeenCalledWith(
      'db$docProperties'
    );
    expect(harness.engine.waitForUpdated).toHaveBeenCalled();
  });

  test.each([false, true])(
    'persists preparing, content and commit in order (offline: %s)',
    async allowOffline => {
      const harness = makeImportHarness();
      await expect(
        harness.service.importShareToWorkspace(harness.metadata, input(), {
          allowOffline,
        })
      ).resolves.toEqual({ status: 'imported', docId: 'document-id' });
      expect(harness.events.indexOf('receipt:set')).toBeLessThan(
        harness.events.indexOf('updated:db$docProperties')
      );
      expect(harness.events.indexOf('updated:db$docProperties')).toBeLessThan(
        harness.events.indexOf('create:document-id:true')
      );
      expect(harness.events.indexOf('updated:document-id')).toBeLessThan(
        harness.events.indexOf('receipt:committed')
      );
      expect(harness.events).not.toContain('synced:document-id');
    }
  );

  test('finishes the committed receipt locally before resolving save', async () => {
    const harness = makeImportHarness();
    const persisted = deferred();
    harness.engine.waitForUpdated.mockImplementation(async id => {
      if (
        id === 'db$docProperties' &&
        harness.events.includes('receipt:committed')
      ) {
        await persisted.promise;
      }
    });
    let finished = false;
    const saving = harness.service
      .importShareToWorkspace(harness.metadata, input(), { allowOffline: true })
      .then(result => {
        finished = true;
        return result;
      });
    await vi.waitFor(() =>
      expect(harness.events).toContain('receipt:committed')
    );
    expect(finished).toBe(false);
    persisted.resolve();
    await expect(saving).resolves.toEqual({
      status: 'imported',
      docId: 'document-id',
    });
  });

  test.each(['collection', 'tag'] as const)(
    'commits content when its selected %s disappears during the write',
    async kind => {
      const harness = makeImportHarness();
      Object.assign(harness.collectionService.collectionMetas$, {
        value: [{ id: 'collection' }],
      });
      Object.assign(harness.tagService.tagList.tags$, {
        value: [{ id: 'tag' }],
      });
      harness.engine.waitForUpdated.mockImplementation(async id => {
        if (id === 'document-id') {
          harness.collectionService.collectionMetas$.value = [];
          harness.tagService.tagList.tags$.value = [];
        }
      });
      const result = await harness.service.importShareToWorkspace(
        harness.metadata,
        {
          ...input(),
          tagIds: kind === 'tag' ? ['tag'] : [],
          collectionId: kind === 'collection' ? 'collection' : undefined,
        },
        { allowOffline: true }
      );
      expect(result).toEqual({
        status: 'imported',
        docId: 'document-id',
        warning: 'destination-not-found',
      });
      expect(harness.events).toContain('receipt:committed');
      expect(
        harness.collectionService.addDocToCollection
      ).not.toHaveBeenCalled();
    }
  );

  test('requires explicit offline confirmation when initial sync is unavailable, before writing', async () => {
    const harness = makeImportHarness();
    harness.engine.waitForSynced.mockRejectedValue(
      new DOMException('Offline', 'AbortError')
    );
    await expect(
      harness.service.importShareToWorkspace(harness.metadata, input())
    ).resolves.toEqual({ status: 'offline-confirmation-required' });
    expect(harness.engine.waitForSynced).toHaveBeenCalledWith(
      'db$docProperties',
      expect.any(AbortSignal)
    );
    expect(harness.docs.createDoc).not.toHaveBeenCalled();
    expect(harness.events).not.toContain('receipt:preparing');
  });

  test('synchronizes existing content before recovering stable blocks', async () => {
    const harness = makeImportHarness({
      receipt: serializeShareImportReceipt(
        createShareImportReceipt({ attemptId: 'attempt-id' })
      ),
      recordExists: true,
    });

    await expect(
      harness.service.importShareToWorkspace(harness.metadata, input())
    ).resolves.toEqual({ status: 'imported', docId: 'document-id' });

    expect(harness.events.indexOf('synced:document-id')).toBeLessThan(
      harness.events.indexOf(
        `add:affine:page:${shareImportBlockIds('attempt-id').page}`
      )
    );
  });

  test('creates an orphan preparing receipt with skipInit and restores the stable skeleton', async () => {
    const harness = makeImportHarness({
      receipt: serializeShareImportReceipt(
        createShareImportReceipt({
          attemptId: 'attempt-id',
        })
      ),
    });

    await expect(
      harness.service.importShareToWorkspace(harness.metadata, input(), {
        allowOffline: true,
      })
    ).resolves.toEqual({ status: 'imported', docId: 'document-id' });

    expect(harness.docs.createDoc).toHaveBeenCalledWith({
      id: 'document-id',
      primaryMode: 'page',
      skipInit: true,
    });
    expect([...harness.blocks.keys()]).toEqual(
      expect.arrayContaining(
        Object.values(shareImportBlockIds('attempt-id')).slice(0, 4)
      )
    );
  });

  test('resumes root-only content by adding only missing skeleton nodes and leaves', async () => {
    const ids = shareImportBlockIds('attempt-id');
    const harness = makeImportHarness({
      recordExists: true,
      receipt: serializeShareImportReceipt(
        createShareImportReceipt({
          attemptId: 'attempt-id',
        })
      ),
      blocks: [{ id: ids.page, flavour: 'affine:page' }],
    });

    await harness.service.importShareToWorkspace(harness.metadata, input(), {
      allowOffline: true,
    });

    expect(harness.events).not.toContain(`add:affine:page:${ids.page}`);
    expect(harness.events).toEqual(
      expect.arrayContaining([
        `add:affine:surface:${ids.surface}`,
        `add:affine:note:${ids.note}`,
        `add:affine:bookmark:${ids.bookmark}`,
      ])
    );
  });

  test('rejects nonmatching skeletons before block or blob writes', async () => {
    const harness = makeImportHarness({
      recordExists: true,
      receipt: serializeShareImportReceipt(
        createShareImportReceipt({
          attemptId: 'attempt-id',
        })
      ),
      blocks: [{ id: 'other-page', flavour: 'affine:page' }],
    });
    const image = new File(['image'], 'shared.png', { type: 'image/png' });

    await expect(
      harness.service.importShareToWorkspace(
        harness.metadata,
        { ...input(), content: { kind: 'image' }, attachment: image },
        { allowOffline: true }
      )
    ).resolves.toEqual({ status: 'import-conflict' });

    expect(harness.events.filter(event => event.startsWith('add:'))).toEqual(
      []
    );
    expect(harness.blobSet).not.toHaveBeenCalled();
    expect(harness.blocks.has('other-page')).toBe(true);
  });

  test('stores one stable attachment block for a valid PDF', async () => {
    const harness = makeImportHarness();
    const file = new File(['%PDF-1.7\ncontent'], 'report.pdf', {
      type: 'application/pdf',
    });
    const ids = shareImportBlockIds('attempt-id');

    await expect(
      harness.service.importShareToWorkspace(
        harness.metadata,
        { ...input(), content: { kind: 'pdf' }, attachment: file },
        { allowOffline: true }
      )
    ).resolves.toEqual({ status: 'imported', docId: 'document-id' });

    expect(harness.blobSet).toHaveBeenCalledWith(file);
    expect(harness.blocks.get(ids.attachment)).toMatchObject({
      flavour: 'affine:attachment',
      parent: { id: ids.note },
      props: {
        id: ids.attachment,
        sourceId: 'blob-id',
        name: 'report.pdf',
        type: 'application/pdf',
        size: file.size,
        embed: true,
        style: 'pdf',
      },
    });
    expect(
      [...harness.blocks.values()].filter(
        block => block.flavour === 'affine:attachment'
      )
    ).toHaveLength(1);
  });

  test.each(['image', 'pdf'] as const)(
    'returns a recoverable status when a %s Blob write fails',
    async kind => {
      const harness = makeImportHarness();
      const file = new File(
        [kind === 'pdf' ? '%PDF-1.7\n' : 'image'],
        `shared.${kind}`,
        {
          type: kind === 'pdf' ? 'application/pdf' : 'image/png',
        }
      );
      harness.blobSet.mockRejectedValueOnce(new Error('storage unavailable'));

      await expect(
        harness.service.importShareToWorkspace(
          harness.metadata,
          { ...input(), content: { kind }, attachment: file },
          { allowOffline: true }
        )
      ).resolves.toEqual({ status: 'attachment-write-failed' });

      expect(
        [...harness.blocks.values()].filter(block =>
          ['affine:image', 'affine:attachment'].includes(block.flavour)
        )
      ).toEqual([]);
      expect(harness.docs.createDoc).not.toHaveBeenCalled();
      expect(harness.events).not.toContain('receipt:preparing');
      expect(harness.events).not.toContain('receipt:committed');
    }
  );

  test.each(['attachment-missing', 'attachment-too-large'] as const)(
    'rejects %s before creating a receipt or document',
    async status => {
      const harness = makeImportHarness();
      const file = new File(['%PDF-1.7\ncontent'], 'report.pdf', {
        type: 'application/pdf',
      });
      Object.defineProperty(file, 'size', { value: 64 * 1024 * 1024 + 1 });

      await expect(
        harness.service.importShareToWorkspace(
          harness.metadata,
          {
            ...input(),
            content: { kind: 'pdf' },
            attachment: status === 'attachment-missing' ? undefined : file,
          },
          { allowOffline: true }
        )
      ).resolves.toEqual({ status });

      expect(harness.docs.createDoc).not.toHaveBeenCalled();
      expect(harness.events).not.toContain('receipt:preparing');
      expect(harness.blobSet).not.toHaveBeenCalled();
      expect(harness.events.filter(event => event.startsWith('add:'))).toEqual(
        []
      );
    }
  );

  test('does not strand workspace A when its blob write fails and workspace B succeeds', async () => {
    const workspaceA = makeImportHarness({ workspaceId: 'workspace-a' });
    const workspaceB = makeImportHarness({ workspaceId: 'workspace-b' });
    const file = new File(['image'], 'shared.png', { type: 'image/png' });
    const share = {
      ...input(),
      content: { kind: 'image' as const },
      attachment: file,
    };
    workspaceA.blobSet.mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(
      workspaceA.service.importShareToWorkspace(workspaceA.metadata, share, {
        allowOffline: true,
      })
    ).resolves.toEqual({ status: 'attachment-write-failed' });
    await expect(
      workspaceB.service.importShareToWorkspace(workspaceB.metadata, share, {
        allowOffline: true,
      })
    ).resolves.toEqual({ status: 'imported', docId: 'document-id' });

    expect(workspaceA.docs.createDoc).not.toHaveBeenCalled();
    expect(workspaceA.events).not.toContain('receipt:preparing');
    expect(workspaceB.events).toContain('receipt:committed');
  });

  test('replays a committed receipt without opening, permissions, metadata, or blobs', async () => {
    const harness = makeImportHarness({
      recordExists: true,
      receipt: serializeShareImportReceipt(
        createShareImportReceipt({
          attemptId: 'attempt-id',
          state: 'committed',
        })
      ),
    });

    await expect(
      harness.service.importShareToWorkspace(harness.metadata, input(), {
        allowOffline: true,
      })
    ).resolves.toEqual({ status: 'committed-replay', docId: 'document-id' });

    expect(harness.docs.open).not.toHaveBeenCalled();
    expect(harness.guard.can).not.toHaveBeenCalled();
    expect(harness.tagService.tagList.tagByTagId$).not.toHaveBeenCalled();
    expect(harness.collectionService.addDocToCollection).not.toHaveBeenCalled();
    expect(harness.blobSet).not.toHaveBeenCalled();
  });

  test('serializes concurrent retries of one attempt into an import and committed replay', async () => {
    const harness = makeImportHarness();
    let releaseFirstGuard!: () => void;
    const firstGuard = new Promise<void>(resolve => {
      releaseFirstGuard = resolve;
    });
    harness.guard.can.mockImplementationOnce(async () => {
      await firstGuard;
      return true;
    });

    const first = harness.service.importShareToWorkspace(
      harness.metadata,
      input('attempt-a'),
      { allowOffline: true }
    );
    await vi.waitFor(() => expect(harness.guard.can).toHaveBeenCalledTimes(1));
    const second = harness.service.importShareToWorkspace(
      harness.metadata,
      input('attempt-a'),
      { allowOffline: true }
    );
    await Promise.resolve();
    releaseFirstGuard();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'imported', docId: 'document-id' },
      { status: 'committed-replay', docId: 'document-id' },
    ]);
    expect(harness.docs.createDoc).toHaveBeenCalledTimes(1);
    expect(harness.docs.open).toHaveBeenCalledTimes(1);
    expect(harness.record.setMeta).toHaveBeenCalledTimes(1);
    expect(
      harness.events.filter(event => event === 'receipt:set')
    ).toHaveLength(2);
  });

  test('rejects a concurrent different attempt without reopening or mutating the winner document', async () => {
    const harness = makeImportHarness();
    let releaseFirstGuard!: () => void;
    const firstGuard = new Promise<void>(resolve => {
      releaseFirstGuard = resolve;
    });
    harness.guard.can.mockImplementationOnce(async () => {
      await firstGuard;
      return true;
    });

    const first = harness.service.importShareToWorkspace(
      harness.metadata,
      input('attempt-a'),
      { allowOffline: true }
    );
    await vi.waitFor(() => expect(harness.guard.can).toHaveBeenCalledTimes(1));
    const second = harness.service.importShareToWorkspace(
      harness.metadata,
      input('attempt-b'),
      { allowOffline: true }
    );
    await Promise.resolve();
    releaseFirstGuard();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'imported', docId: 'document-id' },
      { status: 'import-conflict' },
    ]);
    expect(harness.docs.createDoc).toHaveBeenCalledTimes(1);
    expect(harness.docs.open).toHaveBeenCalledTimes(1);
    expect(harness.docs.setCustomPropertyById).toHaveBeenCalledTimes(2);
    expect(harness.record.setMeta).toHaveBeenCalledTimes(1);
    expect(harness.blobSet).not.toHaveBeenCalled();
  });

  test('releases the share import lock after a failed transaction', async () => {
    const harness = makeImportHarness();
    harness.guard.can.mockRejectedValueOnce(new Error('interrupted'));

    await expect(
      harness.service.importShareToWorkspace(
        harness.metadata,
        input('attempt-a'),
        { allowOffline: true }
      )
    ).rejects.toThrow('interrupted');
    await expect(
      harness.service.importShareToWorkspace(
        harness.metadata,
        input('attempt-b'),
        { allowOffline: true }
      )
    ).resolves.toEqual({ status: 'imported', docId: 'document-id' });
    expect(harness.docs.createDoc).toHaveBeenCalledTimes(1);
  });
});
