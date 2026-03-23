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
  filepath: string;
  startTime: number;
  importStatus: 'pending_import' | 'importing' | 'imported' | 'import_failed';
};

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
  const addBlock = vi.fn(() => 'attachment-1');
  const getBlock = vi.fn(() => ({ model: { id: 'attachment-1' } }));
  const openDoc = vi.fn();

  type MockDoc = {
    workspace: {
      blobSync: {
        set: typeof blobSet;
      };
    };
    addBlock: typeof addBlock;
    getBlock: typeof getBlock;
  };

  type MockDocProps = {
    onStoreLoad: (doc: MockDoc, meta: { noteId: string }) => void;
  };

  const createDoc = vi.fn(({ docProps }: { docProps: MockDocProps }) => {
    queueMicrotask(() => {
      docProps.onStoreLoad(
        {
          workspace: { blobSync: { set: blobSet } },
          addBlock,
          getBlock,
        },
        { noteId: 'note-1' }
      );
    });

    return { id: 'doc-1' };
  });

  const scope = {
    get(token: { name?: string }) {
      switch (token.name) {
        case 'DocsService':
          return { createDoc };
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
      workspace: { scope },
      dispose,
      [Symbol.dispose]: dispose,
    },
    createDoc,
    openDoc,
    blobSet,
    addBlock,
    getBlock,
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

  test('retries pending imports until the active tab has a workspace', async () => {
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
      ...pendingImport,
      importStatus: 'importing',
    });
    getRecordingImportQueue.mockResolvedValue([pendingImport]);

    const { setupRecordingEvents } =
      await import('../../../electron-renderer/src/app/effects/recording');

    setupRecordingEvents({} as never);
    await Promise.resolve();

    expect(workspace.createDoc).not.toHaveBeenCalled();
    expect(claimRecordingImport).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(workspace.createDoc).not.toHaveBeenCalled();
    expect(claimRecordingImport).not.toHaveBeenCalled();

    onRecordingImportQueueChanged?.([pendingImport]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(claimRecordingImport).toHaveBeenCalledWith(7);
    expect(workspace.createDoc).toHaveBeenCalledTimes(1);
    expect(workspace.openDoc).toHaveBeenCalledWith('doc-1');
    expect(workspace.blobSet).toHaveBeenCalledTimes(1);
    const [savedBlob] = workspace.blobSet.mock.calls[0] ?? [];
    expect(savedBlob).toBeInstanceOf(Blob);
    expect((savedBlob as Blob).type).toBe('audio/ogg');
    expect(workspace.addBlock).toHaveBeenCalledWith(
      'affine:attachment',
      expect.objectContaining({ type: 'audio/ogg' }),
      'note-1'
    );
    expect(completeRecordingImport).toHaveBeenCalledWith(7);
    expect(failRecordingImport).not.toHaveBeenCalled();
  });

  test('marks imports as failed when the doc import throws and retries later', async () => {
    const pendingImport = {
      id: 9,
      importStatus: 'import_failed' as const,
      appName: 'Meet',
      filepath: '/tmp/meeting.opus',
      startTime: 1000,
    };

    const workspace = createWorkspaceRef();
    workspace.createDoc.mockImplementationOnce(() => {
      throw new Error('create doc failed');
    });

    isActiveTab.mockResolvedValue(true);
    getCurrentWorkspace.mockReturnValue(workspace.ref);
    claimRecordingImport
      .mockResolvedValueOnce({
        ...pendingImport,
        importStatus: 'importing',
      })
      .mockResolvedValueOnce({
        ...pendingImport,
        importStatus: 'importing',
      });
    getRecordingImportQueue.mockResolvedValue([pendingImport]);

    const { setupRecordingEvents } =
      await import('../../../electron-renderer/src/app/effects/recording');

    setupRecordingEvents({} as never);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(failRecordingImport).toHaveBeenCalledWith(9, 'create doc failed');
    expect(completeRecordingImport).not.toHaveBeenCalled();

    onRecordingImportQueueChanged?.([pendingImport]);
    await vi.advanceTimersByTimeAsync(1000);

    expect(claimRecordingImport).toHaveBeenCalledTimes(2);
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
      importStatus: 'importing' as const,
    }));
    getRecordingImportQueue.mockResolvedValue([firstImport, secondImport]);

    const { setupRecordingEvents } =
      await import('../../../electron-renderer/src/app/effects/recording');

    setupRecordingEvents({} as never);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(claimRecordingImport).toHaveBeenCalledTimes(1);
    expect(claimRecordingImport).toHaveBeenCalledWith(firstImport.id);
    expect(workspace.createDoc).toHaveBeenCalledTimes(1);

    onRecordingImportQueueChanged?.([
      { ...firstImport, importStatus: 'importing' },
      secondImport,
    ]);
    await Promise.resolve();

    expect(claimRecordingImport).toHaveBeenCalledTimes(1);
    expect(workspace.createDoc).toHaveBeenCalledTimes(1);

    firstRead.resolve(new Uint8Array([1, 2, 3]).buffer);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);

    expect(claimRecordingImport).toHaveBeenCalledTimes(2);
    expect(claimRecordingImport).toHaveBeenNthCalledWith(2, secondImport.id);
    expect(workspace.createDoc).toHaveBeenCalledTimes(2);
    expect(completeRecordingImport).toHaveBeenNthCalledWith(1, firstImport.id);
    expect(completeRecordingImport).toHaveBeenNthCalledWith(2, secondImport.id);
  });
});
