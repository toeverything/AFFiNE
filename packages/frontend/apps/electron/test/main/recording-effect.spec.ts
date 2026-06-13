import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const isActiveTab = vi.fn();
const readRecordingFile = vi.fn();
const claimRecordingImport = vi.fn();
const completeRecordingImport = vi.fn();
const failRecordingImport = vi.fn();
const getRecordingImportQueue = vi.fn();
const getCurrentWorkspace = vi.fn();
const isAiEnabled = vi.fn();
const transcribeRecording = vi.fn();

type RecordingImportStatus = {
  id: number;
  appName?: string;
  workspaceId?: string;
  docId?: string;
  filepath: string;
  startTime: number;
  sampleRate?: number;
  numberOfChannels?: number;
  durationMs?: number;
  size?: number;
  degraded?: boolean;
  overflowCount?: number;
  errorMessage?: string;
  importStatus: 'pending_import' | 'importing' | 'imported' | 'import_failed';
  createdAt: number;
  updatedAt: number;
};

function withQueueMeta(
  status: Omit<RecordingImportStatus, 'createdAt' | 'updatedAt'>
): RecordingImportStatus {
  return {
    createdAt: 1,
    updatedAt: 1,
    ...status,
  };
}

let onRecordingImportQueueChanged:
  | ((queue: RecordingImportStatus[]) => void)
  | undefined;

vi.mock('@affine/core/modules/doc', () => ({
  DocsService: class DocsService {},
}));

vi.mock('@affine/core/modules/media/services/audio-attachment', () => ({
  AudioAttachmentService: class AudioAttachmentService {},
}));

vi.mock('@affine/core/modules/workbench', () => ({
  WorkbenchService: class WorkbenchService {},
}));

vi.mock('@affine/debug', () => ({
  DebugLogger: class DebugLogger {
    debug = vi.fn();
    error = vi.fn();
  },
}));

vi.mock('@affine/electron-api', () => ({
  apis: {
    ui: {
      isActiveTab,
    },
    recording: {
      readRecordingFile,
      claimRecordingImport,
      completeRecordingImport,
      failRecordingImport,
      getRecordingImportQueue,
    },
  },
  events: {
    recording: {
      onRecordingImportQueueChanged: vi.fn(
        (handler: typeof onRecordingImportQueueChanged) => {
          onRecordingImportQueueChanged = handler;
          return () => {
            onRecordingImportQueueChanged = undefined;
          };
        }
      ),
    },
  },
}));

vi.mock('@affine/i18n', () => ({
  i18nTime: vi.fn(() => 'Jan 1 09:00'),
}));

vi.mock('@affine/track', () => ({
  default: {
    doc: {
      editor: {
        audioBlock: {
          transcribeRecording,
        },
      },
    },
  },
}));

vi.mock('../../../electron-renderer/src/app/effects/utils', () => ({
  getCurrentWorkspace,
  isAiEnabled,
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createWorkspaceRef() {
  const blobSet = vi.fn(async () => 'blob-1');
  const openDoc = vi.fn();
  const createdDocs = new Set<string>();
  type MockBlockRecord = { model: unknown } | null;
  type MockBlockStore = {
    addBlock: (
      flavour: string,
      props: Record<string, unknown>,
      parentId?: string
    ) => string;
    getBlock: (id: string) => MockBlockRecord;
    // eslint-disable-next-line rxjs/finnish
    getBlock$: (id: string) => MockBlockRecord;
  };
  const attachments: Array<{
    id: string;
    props: { name: string; type: string };
    childMap: { value: Map<string, true> };
    store: MockBlockStore;
  }> = [];
  const transcriptionBlocks: Array<{
    id: string;
    flavour: string;
    props: {
      transcription: {
        sourceAudio?: Record<string, unknown>;
        quality?: Record<string, unknown>;
      };
    };
  }> = [];

  const blockSuiteDoc = {
    getModelsByFlavour: vi.fn((flavour: string) => {
      if (flavour === 'affine:page') {
        return [{ id: 'page-1' }];
      }
      if (flavour === 'affine:note') {
        return [{ id: 'note-1' }];
      }
      if (flavour === 'affine:attachment') {
        return attachments;
      }
      return [];
    }),
    addBlock: vi.fn(
      (flavour: string, props: Record<string, unknown>, parentId?: string) => {
        if (flavour === 'affine:attachment') {
          const id = `attachment-${attachments.length + 1}`;
          const attachment = {
            id,
            props: {
              name: typeof props.name === 'string' ? props.name : '',
              type: typeof props.type === 'string' ? props.type : '',
            },
            childMap: { value: new Map<string, true>() },
            store: {
              addBlock: (...args: Parameters<typeof blockSuiteDoc.addBlock>) =>
                blockSuiteDoc.addBlock(...args),
              getBlock: (blockId: string) => blockSuiteDoc.getBlock(blockId),
              // eslint-disable-next-line rxjs/finnish
              getBlock$: (blockId: string) => blockSuiteDoc.getBlock(blockId),
            },
          };
          attachments.push(attachment);
          return id;
        }
        if (flavour === 'affine:transcription') {
          const id = `transcription-${transcriptionBlocks.length + 1}`;
          const block = {
            id,
            flavour,
            props: {
              transcription:
                (props.transcription as {
                  sourceAudio?: Record<string, unknown>;
                  quality?: Record<string, unknown>;
                }) ?? {},
            },
          };
          transcriptionBlocks.push(block);
          const attachment = attachments.find(entry => entry.id === parentId);
          attachment?.childMap.value.set(id, true);
          return id;
        }
        return `${flavour}-1`;
      }
    ),
    getBlock: vi.fn((id: string) => {
      const attachment = attachments.find(entry => entry.id === id);
      if (attachment) {
        return { model: attachment };
      }
      const transcriptionBlock = transcriptionBlocks.find(
        entry => entry.id === id
      );
      return transcriptionBlock ? { model: transcriptionBlock } : null;
    }),
  };

  const createDoc = vi.fn(({ id }: { id: string }) => {
    createdDocs.add(id);
    return { id };
  });

  const open = vi.fn((docId: string) => {
    if (!createdDocs.has(docId)) {
      throw new Error(`Doc ${docId} not found`);
    }
    return {
      doc: {
        workspace: { id: 'workspace-1' },
        blockSuiteDoc,
        addPriorityLoad: vi.fn(() => vi.fn()),
        waitForSyncReady: vi.fn(async () => undefined),
      },
      release: vi.fn(),
    };
  });

  const scope = {
    get(token: { name?: string }) {
      switch (token.name) {
        case 'DocsService':
          return {
            createDoc,
            open,
            list: {
              ['doc$']: (docId: string) => ({
                value: createdDocs.has(docId) ? { id: docId } : null,
              }),
            },
          };
        case 'WorkbenchService':
          return { workbench: { openDoc } };
        case 'AudioAttachmentService':
          return {
            get: () => ({
              obj: {
                transcribe: vi.fn(async () => undefined),
              },
              [Symbol.dispose]: vi.fn(),
            }),
          };
        default:
          throw new Error(`Unexpected token: ${token.name}`);
      }
    },
  };

  const dispose = vi.fn();

  return {
    ref: {
      workspace: {
        id: 'workspace-1',
        scope,
        docCollection: {
          blobSync: { set: blobSet },
        },
      },
      dispose,
      [Symbol.dispose]: dispose,
    },
    createDoc,
    openDoc,
    blobSet,
    attachments,
    transcriptionBlocks,
  };
}

describe('recording effect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
    onRecordingImportQueueChanged = undefined;
    readRecordingFile.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    completeRecordingImport.mockResolvedValue(undefined);
    failRecordingImport.mockResolvedValue(undefined);
    isAiEnabled.mockReturnValue(false);
    getRecordingImportQueue.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  test('retries pending imports until the active tab has a workspace and claims with workspace binding', async () => {
    const workspace = createWorkspaceRef();
    const pendingImport = {
      id: 7,
      importStatus: 'pending_import' as const,
      appName: 'Zoom',
      filepath: '/tmp/meeting.opus',
      startTime: 1000,
    };

    isActiveTab.mockResolvedValueOnce(false).mockResolvedValue(true);
    getCurrentWorkspace
      .mockReturnValueOnce(undefined)
      .mockReturnValue(workspace.ref);
    claimRecordingImport.mockResolvedValue({
      ...withQueueMeta(pendingImport),
      workspaceId: 'workspace-1',
      docId: 'recording-7',
      importStatus: 'importing',
    });
    getRecordingImportQueue.mockResolvedValue([withQueueMeta(pendingImport)]);

    const { setupRecordingEvents } =
      await import('../../../electron-renderer/src/app/effects/recording');

    setupRecordingEvents({} as never);
    await Promise.resolve();

    expect(workspace.createDoc).not.toHaveBeenCalled();
    expect(claimRecordingImport).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(workspace.createDoc).not.toHaveBeenCalled();
    expect(claimRecordingImport).not.toHaveBeenCalled();

    onRecordingImportQueueChanged?.([withQueueMeta(pendingImport)]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(claimRecordingImport).toHaveBeenCalledWith(7, 'workspace-1');
    expect(workspace.createDoc).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'recording-7' })
    );
    expect(workspace.openDoc).toHaveBeenCalledWith('recording-7');
    expect(workspace.blobSet).toHaveBeenCalledTimes(1);
    expect(completeRecordingImport).toHaveBeenCalledWith(7);
    expect(failRecordingImport).not.toHaveBeenCalled();
  });

  test('reuses the same doc when a claimed import already carries docId', async () => {
    const workspace = createWorkspaceRef();
    const pendingImport = {
      id: 8,
      importStatus: 'pending_import' as const,
      appName: 'Meet',
      filepath: '/tmp/meeting.opus',
      startTime: 1000,
      workspaceId: 'workspace-1',
      docId: 'recording-8',
    };

    workspace.createDoc({ id: 'recording-8' });
    isActiveTab.mockResolvedValue(true);
    getCurrentWorkspace.mockReturnValue(workspace.ref);
    claimRecordingImport.mockResolvedValue({
      ...withQueueMeta(pendingImport),
      importStatus: 'importing',
    });
    getRecordingImportQueue.mockResolvedValue([withQueueMeta(pendingImport)]);

    const { setupRecordingEvents } =
      await import('../../../electron-renderer/src/app/effects/recording');

    setupRecordingEvents({} as never);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(workspace.createDoc).toHaveBeenCalledTimes(1);
    expect(workspace.blobSet).toHaveBeenCalledTimes(1);
    expect(completeRecordingImport).toHaveBeenCalledWith(8);
  });

  test('writes recording metadata into the transcription block', async () => {
    const workspace = createWorkspaceRef();
    const pendingImport = withQueueMeta({
      id: 18,
      importStatus: 'pending_import',
      appName: 'Meet',
      filepath: '/tmp/meeting.opus',
      startTime: 1000,
      sampleRate: 48_000,
      numberOfChannels: 2,
      durationMs: 120_000,
      degraded: true,
      overflowCount: 4,
    });

    isActiveTab.mockResolvedValue(true);
    getCurrentWorkspace.mockReturnValue(workspace.ref);
    claimRecordingImport.mockResolvedValue({
      ...pendingImport,
      workspaceId: 'workspace-1',
      docId: 'recording-18',
      importStatus: 'importing',
    });
    getRecordingImportQueue.mockResolvedValue([pendingImport]);

    const { setupRecordingEvents } =
      await import('../../../electron-renderer/src/app/effects/recording');

    setupRecordingEvents({} as never);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(workspace.transcriptionBlocks).toHaveLength(1);
    expect(workspace.transcriptionBlocks[0]?.props.transcription).toEqual({
      sourceAudio: {
        mimeType: 'audio/ogg',
        durationMs: 120_000,
        sampleRate: 48_000,
        channels: 2,
      },
      quality: {
        degraded: true,
        overflowCount: 4,
      },
    });
  });

  test('marks imports as failed when blob import fails after claim', async () => {
    const pendingImport = {
      id: 9,
      importStatus: 'pending_import' as const,
      appName: 'Meet',
      filepath: '/tmp/meeting.opus',
      startTime: 1000,
    };
    const workspace = createWorkspaceRef();
    workspace.blobSet.mockRejectedValueOnce(new Error('blob import failed'));

    isActiveTab.mockResolvedValue(true);
    getCurrentWorkspace.mockReturnValue(workspace.ref);
    claimRecordingImport.mockResolvedValue({
      ...withQueueMeta(pendingImport),
      workspaceId: 'workspace-1',
      docId: 'recording-9',
      importStatus: 'importing',
    });
    getRecordingImportQueue.mockResolvedValue([withQueueMeta(pendingImport)]);

    const { setupRecordingEvents } =
      await import('../../../electron-renderer/src/app/effects/recording');

    setupRecordingEvents({} as never);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(failRecordingImport).toHaveBeenCalledWith(9, 'blob import failed');
    expect(completeRecordingImport).not.toHaveBeenCalled();
  });

  test('releases priority load when waiting for sync readiness fails', async () => {
    const pendingImport = {
      id: 10,
      importStatus: 'pending_import' as const,
      appName: 'Meet',
      filepath: '/tmp/meeting.opus',
      startTime: 1000,
    };
    const disposePriorityLoad = vi.fn();
    const release = vi.fn();
    const workspace = {
      ref: {
        workspace: {
          id: 'workspace-1',
          scope: {
            get(token: { name?: string }) {
              switch (token.name) {
                case 'DocsService':
                  return {
                    createDoc: vi.fn(),
                    open: vi.fn(() => ({
                      doc: {
                        blockSuiteDoc: {},
                        addPriorityLoad: vi.fn(() => disposePriorityLoad),
                        waitForSyncReady: vi
                          .fn()
                          .mockRejectedValue(new Error('sync failed')),
                      },
                      release,
                    })),
                    list: {
                      ['doc$']: vi.fn(() => ({
                        value: { id: 'recording-10' },
                      })),
                    },
                  };
                case 'WorkbenchService':
                case 'AudioAttachmentService':
                  return {};
                default:
                  throw new Error(`Unexpected token: ${token.name}`);
              }
            },
          },
          docCollection: {
            blobSync: { set: vi.fn() },
          },
        },
        dispose: vi.fn(),
        [Symbol.dispose]: vi.fn(),
      },
    };

    isActiveTab.mockResolvedValue(true);
    getCurrentWorkspace.mockReturnValue(workspace.ref);
    claimRecordingImport.mockResolvedValue({
      ...withQueueMeta(pendingImport),
      workspaceId: 'workspace-1',
      docId: 'recording-10',
      importStatus: 'importing',
    });
    getRecordingImportQueue.mockResolvedValue([withQueueMeta(pendingImport)]);

    const { setupRecordingEvents } =
      await import('../../../electron-renderer/src/app/effects/recording');

    setupRecordingEvents({} as never);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(disposePriorityLoad).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(failRecordingImport).toHaveBeenCalledWith(10, 'sync failed');
    expect(completeRecordingImport).not.toHaveBeenCalled();
  });

  test('processes recording imports one at a time even when the queue changes mid-import', async () => {
    const firstImport = {
      id: 7,
      importStatus: 'pending_import' as const,
      appName: 'Zoom',
      filepath: '/tmp/meeting-1.opus',
      startTime: 1000,
    };
    const secondImport = {
      id: 8,
      importStatus: 'pending_import' as const,
      appName: 'Meet',
      filepath: '/tmp/meeting-2.opus',
      startTime: 2000,
    };
    const firstRead = createDeferred<ArrayBuffer>();
    const workspace = createWorkspaceRef();

    isActiveTab.mockResolvedValue(true);
    getCurrentWorkspace.mockReturnValue(workspace.ref);
    readRecordingFile
      .mockImplementationOnce(() => firstRead.promise)
      .mockResolvedValueOnce(new Uint8Array([4, 5, 6]).buffer);
    claimRecordingImport.mockImplementation(async (id: number) => ({
      ...(id === firstImport.id ? firstImport : secondImport),
      workspaceId: 'workspace-1',
      docId: `recording-${id}`,
      importStatus: 'importing' as const,
      createdAt: 1,
      updatedAt: 1,
    }));
    getRecordingImportQueue.mockResolvedValue([
      withQueueMeta(firstImport),
      withQueueMeta(secondImport),
    ]);

    const { setupRecordingEvents } =
      await import('../../../electron-renderer/src/app/effects/recording');

    setupRecordingEvents({} as never);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(claimRecordingImport).toHaveBeenCalledTimes(1);
    expect(claimRecordingImport).toHaveBeenCalledWith(
      firstImport.id,
      'workspace-1'
    );

    onRecordingImportQueueChanged?.([
      withQueueMeta({
        ...firstImport,
        workspaceId: 'workspace-1',
        docId: 'recording-7',
        importStatus: 'importing',
      }),
      withQueueMeta(secondImport),
    ]);
    await Promise.resolve();

    expect(claimRecordingImport).toHaveBeenCalledTimes(1);

    firstRead.resolve(new Uint8Array([1, 2, 3]).buffer);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);

    expect(claimRecordingImport).toHaveBeenCalledTimes(2);
    expect(claimRecordingImport).toHaveBeenNthCalledWith(
      2,
      secondImport.id,
      'workspace-1'
    );
    expect(completeRecordingImport).toHaveBeenNthCalledWith(1, firstImport.id);
    expect(completeRecordingImport).toHaveBeenNthCalledWith(2, secondImport.id);
  });
});
