/** @vitest-environment happy-dom */

import { CollectionService } from '../../collection';
import { DocsService } from '../../doc';
import { GuardService } from '../../permissions';
import { TagService } from '../../tag';
import type { WorkspaceMetadata, WorkspacesService } from '../../workspace';
import { AsyncLock } from '@toeverything/infra/utils';
import { ImportClipperService, type ShareImportInput } from './import';
import { shareImportBlockIds } from './share-block-plan';
import { describe, expect, test, vi } from 'vitest';

import {
  createShareImportReceipt,
  decideShareImportRecovery,
  parseShareImportReceipt,
  serializeShareImportReceipt,
  shouldSynchronizeShareImport,
} from './share-import-receipt';

describe('share import receipt', () => {
  test('serializes the canonical preparing fixture', () => {
    expect(
      serializeShareImportReceipt(
        createShareImportReceipt({
          attemptId: 'attempt-id',
        })
      )
    ).toBe('{"version":1,"attemptId":"attempt-id","state":"preparing"}');
  });

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
      status: 'unknown',
    }),
  ])('rejects malformed or unsupported persisted values %#', value => {
    expect(parseShareImportReceipt(value)).toBeUndefined();
  });

  test('round-trips the canonical committed fixture without accepting extra or old schema', () => {
    const receipt = {
      version: 1 as const,
      attemptId: 'attempt-id',
      state: 'committed' as const,
    };

    expect(parseShareImportReceipt(JSON.stringify(receipt))).toEqual(receipt);
    expect(
      parseShareImportReceipt(JSON.stringify({ ...receipt, unexpected: true }))
    ).toBeUndefined();
    expect(
      parseShareImportReceipt(
        JSON.stringify({
          version: 1,
          documentId: 'document-id',
          importAttemptId: 'attempt-id',
          status: 'committed',
        })
      )
    ).toBeUndefined();
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
    [
      'crash after skeleton before leaves',
      'preparing',
      true,
      'resume-preparing',
    ],
    ['same attempt retry', 'preparing', true, 'resume-preparing'],
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

  test('confirmed offline imports never select remote synchronization', () => {
    expect(
      shouldSynchronizeShareImport({
        isLocal: false,
        verification: 'confirmed',
        allowOffline: true,
      })
    ).toBe(false);
    expect(
      shouldSynchronizeShareImport({
        isLocal: false,
        verification: 'confirmed',
        allowOffline: false,
      })
    ).toBe(true);
    expect(
      shouldSynchronizeShareImport({
        isLocal: true,
        verification: 'confirmed',
        allowOffline: false,
      })
    ).toBe(false);
  });
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

function makeImportHarness({
  receipt,
  recordExists = false,
  blocks = [],
}: {
  receipt?: string;
  recordExists?: boolean;
  blocks?: { id: string; flavour: string; parentId?: string }[];
} = {}) {
  const events: string[] = [];
  const models = new Map<
    string,
    { id: string; flavour: string; parent?: { id: string }; props: any }
  >();
  for (const block of blocks) {
    models.set(block.id, {
      id: block.id,
      flavour: block.flavour,
      parent: block.parentId ? { id: block.parentId } : undefined,
      props: {},
    });
  }
  const blockSuiteDoc = {
    getBlock: (id: string) => {
      const model = models.get(id);
      return model ? { id, model } : undefined;
    },
    getBlocksByFlavour: (flavour: string) =>
      [...models.values()]
        .filter(model => model.flavour === flavour)
        .map(model => ({ id: model.id, model })),
    addBlock: (flavour: string, props: any, parentId?: string) => {
      events.push(`add:${flavour}:${props.id}`);
      const id = props.id as string;
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
      models.set(id, {
        id,
        flavour,
        parent: parentId ? { id: parentId } : undefined,
        props: storedProps,
      });
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
    addPriority: vi.fn((id: string) => events.push(`priority:${id}`)),
    waitForDocReady: vi.fn(async (id: string) => events.push(`ready:${id}`)),
    waitForDocLoaded: vi.fn(async (id: string) => events.push(`loaded:${id}`)),
    waitForUpdated: vi.fn(async (id: string) => events.push(`updated:${id}`)),
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
    id: 'workspace-id',
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
    id: 'workspace-id',
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
      shareImportLock: new AsyncLock(),
    }) as ImportClipperService,
    metadata,
  };
}

describe('share import orchestration', () => {
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

  test('writes and locally persists preparing receipt before creating the document', async () => {
    const harness = makeImportHarness();

    await harness.service.importShareToWorkspace(harness.metadata, input(), {
      allowOffline: true,
    });

    expect(harness.events.indexOf('receipt:set')).toBeLessThan(
      harness.events.indexOf('updated:db$docProperties')
    );
    expect(harness.events.indexOf('updated:db$docProperties')).toBeLessThan(
      harness.events.indexOf('create:document-id:true')
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
