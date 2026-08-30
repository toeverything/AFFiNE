/** @vitest-environment happy-dom */

import { FileSizeLimitProvider } from '@blocksuite/affine/shared/services';
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

function richInput(importAttemptId = 'attempt-id'): ShareImportInput {
  return {
    ...input(importAttemptId),
    content: {
      kind: 'url',
      url: 'https://youtube.com/watch?v=video-id',
      text: 'Selected quote',
    },
    preview: {
      url: 'https://youtube.com/watch?v=video-id',
      provider: 'youtube',
      author: { name: 'Author' },
      durationSeconds: 214,
      transcript: {
        chapters: [{ title: 'Opening', startSeconds: 0 }],
        segments: [{ text: 'Welcome', startSeconds: 1, speaker: 'Host' }],
      },
    },
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
  maxFileSize = 2 * 1024 * 1024 * 1024,
  failAfterBlockId,
}: {
  receipt?: string;
  recordExists?: boolean;
  blocks?: { id: string; flavour: string; parentId?: string }[];
  maxFileSize?: number;
  failAfterBlockId?: string;
} = {}) {
  const events: string[] = [];
  type HarnessModel = {
    id: string;
    flavour: string;
    parent?: HarnessModel;
    children: HarnessModel[];
    props: any;
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
      props: any,
      parentId?: string,
      parentIndex?: number
    ) => {
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
  const blockStdUnmount = vi.fn();
  const createShareImportBlockStdScope = vi.fn(() => ({
    get: (token: unknown) => {
      if (token === FileSizeLimitProvider) return { maxFileSize };
      throw new Error('Unexpected BlockStd service token');
    },
    unmount: blockStdUnmount,
  }));
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
    blockStdUnmount,
    createShareImportBlockStdScope,
    waitForRevalidation,
    getWorkspaceProfile,
    service: Object.assign(Object.create(ImportClipperService.prototype), {
      workspacesService: workspaces,
      shareImportTails: new Map(),
      createShareImportBlockStdScope,
    }) as ImportClipperService,
    metadata,
  };
}

describe('share import orchestration', () => {
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
    expect((service as any).shareImportTails.size).toBe(0);
  });

  test('allows different workspace or document keys to complete while one key is blocked', async () => {
    const firstGate = deferred();
    const started: string[] = [];
    const service = makeQueuedImportService(async (metadata, currentInput) => {
      const label = `${metadata.id}:${currentInput.documentId}`;
      started.push(label);
      if (label === 'workspace-id:document-id') {
        await firstGate.promise;
      }
      return { status: 'imported', docId: currentInput.documentId };
    });
    const metadata = {
      id: 'workspace-id',
      flavour: 'server',
    } as WorkspaceMetadata;
    const otherWorkspace = {
      id: 'other-workspace-id',
      flavour: 'server',
    } as WorkspaceMetadata;

    const a = service.importShareToWorkspace(metadata, input('A'));
    await vi.waitFor(() =>
      expect(started).toEqual(['workspace-id:document-id'])
    );
    const b = service.importShareToWorkspace(metadata, {
      ...input('B'),
      documentId: 'other-document-id',
    });
    const c = service.importShareToWorkspace(otherWorkspace, input('C'));

    await expect(Promise.all([b, c])).resolves.toEqual([
      { status: 'imported', docId: 'other-document-id' },
      { status: 'imported', docId: 'document-id' },
    ]);
    expect(started).toEqual(
      expect.arrayContaining([
        'workspace-id:other-document-id',
        'other-workspace-id:document-id',
      ])
    );
    firstGate.resolve();
    await a;
    expect((service as any).shareImportTails.size).toBe(0);
  });

  test('does not conflate queue keys whose identifiers contain separators', async () => {
    const firstGate = deferred();
    const started: string[] = [];
    const service = makeQueuedImportService(async (_metadata, currentInput) => {
      started.push(currentInput.importAttemptId);
      if (currentInput.importAttemptId === 'A') {
        await firstGate.promise;
      }
      return { status: 'imported', docId: currentInput.documentId };
    });

    const a = service.importShareToWorkspace(
      { id: 'workspace:document', flavour: 'server' } as WorkspaceMetadata,
      { ...input('A'), documentId: 'id' }
    );
    await vi.waitFor(() => expect(started).toEqual(['A']));
    const b = service.importShareToWorkspace(
      { id: 'workspace', flavour: 'server' } as WorkspaceMetadata,
      { ...input('B'), documentId: 'document:id' }
    );

    await expect(b).resolves.toEqual({
      status: 'imported',
      docId: 'document:id',
    });
    expect(started).toEqual(['A', 'B']);
    firstGate.resolve();
    await a;
    expect((service as any).shareImportTails.size).toBe(0);
  });

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

  test('synchronizes the document before recording the committed receipt', async () => {
    const harness = makeImportHarness();

    await expect(
      harness.service.importShareToWorkspace(harness.metadata, input())
    ).resolves.toEqual({ status: 'imported', docId: 'document-id' });

    const committedReceipt = harness.events.indexOf('receipt:committed');
    expect(harness.events.indexOf('updated:document-id')).toBeLessThan(
      committedReceipt
    );
    expect(harness.events.indexOf('synced:document-id')).toBeLessThan(
      committedReceipt
    );
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

  test.each([
    [
      'callout',
      (ids: ReturnType<typeof shareImportBlockIds>) => ids.transcript,
    ],
    [
      'heading',
      (ids: ReturnType<typeof shareImportBlockIds>) => ids.transcriptHeading,
    ],
    [
      'chapter',
      (ids: ReturnType<typeof shareImportBlockIds>) => ids.transcriptChapter(0),
    ],
    [
      'segment',
      (ids: ReturnType<typeof shareImportBlockIds>) => ids.transcriptSegment(0),
    ],
  ])(
    'repairs a rich transcript after failure immediately following the %s write',
    async (_name, failedId) => {
      const ids = shareImportBlockIds('attempt-id');
      const targetId = failedId(ids);
      const harness = makeImportHarness({ failAfterBlockId: targetId });

      await expect(
        harness.service.importShareToWorkspace(harness.metadata, richInput(), {
          allowOffline: true,
        })
      ).rejects.toThrow(`Injected failure after ${targetId}`);
      const existing = harness.blocks.get(targetId);
      expect(existing).toBeTruthy();
      existing!.props.userEditedMarker = 'preserve-me';

      await expect(
        harness.service.importShareToWorkspace(harness.metadata, richInput(), {
          allowOffline: true,
        })
      ).resolves.toEqual({ status: 'imported', docId: 'document-id' });

      expect(harness.blocks.get(targetId)?.props.userEditedMarker).toBe(
        'preserve-me'
      );
      expect(harness.blocks.get(ids.transcript)).toMatchObject({
        flavour: 'affine:callout',
        parent: { id: ids.note },
      });
      expect(harness.blocks.get(ids.transcriptHeading)?.parent?.id).toBe(
        ids.transcript
      );
      expect(harness.blocks.get(ids.transcriptChapter(0))?.parent?.id).toBe(
        ids.transcript
      );
      expect(harness.blocks.get(ids.transcriptSegment(0))?.parent?.id).toBe(
        ids.transcript
      );
      expect(
        harness.events.filter(event => event.endsWith(`:${targetId}`))
      ).toHaveLength(1);
    }
  );

  test('preserves unrelated siblings while repairing deterministic share order', async () => {
    const ids = shareImportBlockIds('attempt-id');
    const harness = makeImportHarness({
      failAfterBlockId: ids.transcriptSegment(0),
    });

    await expect(
      harness.service.importShareToWorkspace(harness.metadata, richInput(), {
        allowOffline: true,
      })
    ).rejects.toThrow(`Injected failure after ${ids.transcriptSegment(0)}`);
    harness.addBlock(
      'affine:paragraph',
      { id: 'user-block', userEditedMarker: 'preserve-me' },
      ids.note,
      2
    );
    harness.removeBlock(ids.metadata);

    await expect(
      harness.service.importShareToWorkspace(harness.metadata, richInput(), {
        allowOffline: true,
      })
    ).resolves.toEqual({ status: 'imported', docId: 'document-id' });

    const childIds =
      harness.blocks.get(ids.note)?.children.map(child => child.id) ?? [];
    expect(childIds.filter(id => id.startsWith('share-attempt-id-'))).toEqual([
      ids.bookmark,
      ids.metadata,
      ids.selectedText,
      ids.transcript,
    ]);
    expect(childIds).toContain('user-block');
    expect(harness.blocks.get('user-block')?.props.userEditedMarker).toBe(
      'preserve-me'
    );
  });

  test.each([
    [
      'root metadata',
      (ids: ReturnType<typeof shareImportBlockIds>) => ids.metadata,
    ],
    [
      'transcript heading',
      (ids: ReturnType<typeof shareImportBlockIds>) => ids.transcriptHeading,
    ],
    [
      'transcript chapter',
      (ids: ReturnType<typeof shareImportBlockIds>) => ids.transcriptChapter(0),
    ],
  ])(
    'repairs a missing %s at its deterministic sibling position',
    async (_name, missingId) => {
      const ids = shareImportBlockIds('attempt-id');
      const harness = makeImportHarness({
        failAfterBlockId: ids.transcriptSegment(0),
      });

      await expect(
        harness.service.importShareToWorkspace(harness.metadata, richInput(), {
          allowOffline: true,
        })
      ).rejects.toThrow(`Injected failure after ${ids.transcriptSegment(0)}`);
      harness.removeBlock(missingId(ids));

      await expect(
        harness.service.importShareToWorkspace(harness.metadata, richInput(), {
          allowOffline: true,
        })
      ).resolves.toEqual({ status: 'imported', docId: 'document-id' });

      expect(
        harness.blocks.get(ids.note)?.children.map(child => child.id)
      ).toEqual([ids.bookmark, ids.metadata, ids.selectedText, ids.transcript]);
      expect(
        harness.blocks.get(ids.transcript)?.children.map(child => child.id)
      ).toEqual([
        ids.transcriptHeading,
        ids.transcriptChapter(0),
        ids.transcriptSegment(0),
      ]);
    }
  );

  test.each([
    ['wrong callout flavour', 'affine:paragraph', 'note'],
    ['wrong callout parent', 'affine:callout', 'page'],
    ['wrong heading flavour', 'affine:list', 'transcript'],
    ['wrong heading parent', 'affine:paragraph', 'note'],
  ])(
    'rejects a rich stable-id collision with %s before adding missing leaves',
    async (_name, flavour, parentKind) => {
      const ids = shareImportBlockIds('attempt-id');
      const isHeading = _name.includes('heading');
      const id = isHeading ? ids.transcriptHeading : ids.transcript;
      const parentId =
        parentKind === 'page'
          ? ids.page
          : parentKind === 'transcript'
            ? ids.transcript
            : ids.note;
      const harness = makeImportHarness({
        recordExists: true,
        receipt: serializeShareImportReceipt(
          createShareImportReceipt({ attemptId: 'attempt-id' })
        ),
        blocks: [
          { id: ids.page, flavour: 'affine:page' },
          { id: ids.surface, flavour: 'affine:surface', parentId: ids.page },
          { id: ids.note, flavour: 'affine:note', parentId: ids.page },
          ...(isHeading
            ? [
                {
                  id: ids.transcript,
                  flavour: 'affine:callout',
                  parentId: ids.note,
                },
              ]
            : []),
          { id, flavour, parentId },
        ],
      });

      await expect(
        harness.service.importShareToWorkspace(harness.metadata, richInput(), {
          allowOffline: true,
        })
      ).resolves.toEqual({ status: 'import-conflict' });
      expect(harness.events.filter(event => event.startsWith('add:'))).toEqual(
        []
      );
      expect(harness.events).not.toContain('receipt:committed');
    }
  );

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

  test('rejects a PDF without its File before creating a document', async () => {
    const harness = makeImportHarness();

    await expect(
      harness.service.importShareToWorkspace(
        harness.metadata,
        { ...input(), content: { kind: 'pdf' } },
        { allowOffline: true }
      )
    ).resolves.toEqual({ status: 'attachment-missing' });

    expect(harness.docs.createDoc).not.toHaveBeenCalled();
    expect(harness.blobSet).not.toHaveBeenCalled();
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
    expect(harness.createShareImportBlockStdScope).toHaveBeenCalledTimes(1);
    expect(harness.blockStdUnmount).toHaveBeenCalledTimes(1);
    expect(harness.blocks.get(ids.attachment)).toMatchObject({
      flavour: 'affine:attachment',
      parent: { id: ids.note },
      props: {
        id: ids.attachment,
        sourceId: 'blob-id',
        name: 'report.pdf',
        type: 'application/pdf',
        size: file.size,
        embed: false,
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
      expect(harness.events).not.toContain('receipt:committed');
    }
  );

  test('resolves the PDF limit from BlockStd before blob or block writes', async () => {
    const harness = makeImportHarness({ maxFileSize: 4 });
    const file = new File(['%PDF-1.7\ncontent'], 'report.pdf', {
      type: 'application/pdf',
    });

    await expect(
      harness.service.importShareToWorkspace(
        harness.metadata,
        { ...input(), content: { kind: 'pdf' }, attachment: file },
        { allowOffline: true }
      )
    ).resolves.toEqual({ status: 'attachment-too-large' });

    expect(harness.docs.createDoc).toHaveBeenCalledTimes(1);
    expect(harness.blobSet).not.toHaveBeenCalled();
    expect(harness.events.filter(event => event.startsWith('add:'))).toEqual(
      []
    );
    expect(harness.createShareImportBlockStdScope).toHaveBeenCalledTimes(1);
    expect(harness.blockStdUnmount).toHaveBeenCalledTimes(1);
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
