import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const isActiveTab = vi.fn();
const readRecordingFile = vi.fn();
const setRecordingBlockCreationStatus = vi.fn();
const getCurrentWorkspace = vi.fn();
const isAiEnabled = vi.fn();
const transcribeRecording = vi.fn();

let onRecordingStatusChanged:
  | ((
      status: {
        id: number;
        status: 'processing';
        appName?: string;
        filepath?: string;
        startTime: number;
        blockCreationStatus?: 'success' | 'failed';
      } | null
    ) => void)
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
      setRecordingBlockCreationStatus,
    },
  },
  events: {
    recording: {
      onRecordingStatusChanged: vi.fn(
        (handler: typeof onRecordingStatusChanged) => {
          onRecordingStatusChanged = handler;
          return () => {
            onRecordingStatusChanged = undefined;
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
    onRecordingStatusChanged = undefined;
    readRecordingFile.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    setRecordingBlockCreationStatus.mockResolvedValue(undefined);
    isAiEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  test('retries processing until the active tab has a workspace', async () => {
    const workspace = createWorkspaceRef();

    isActiveTab.mockResolvedValueOnce(false).mockResolvedValue(true);
    getCurrentWorkspace
      .mockReturnValueOnce(undefined)
      .mockReturnValue(workspace.ref);

    const { setupRecordingEvents } =
      await import('../../../electron-renderer/src/app/effects/recording');

    setupRecordingEvents({} as never);

    onRecordingStatusChanged?.({
      id: 7,
      status: 'processing',
      appName: 'Zoom',
      filepath: '/tmp/meeting.opus',
      startTime: 1000,
    });

    await Promise.resolve();
    expect(workspace.createDoc).not.toHaveBeenCalled();
    expect(setRecordingBlockCreationStatus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(workspace.createDoc).not.toHaveBeenCalled();
    expect(setRecordingBlockCreationStatus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

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
    expect(setRecordingBlockCreationStatus).toHaveBeenCalledWith(7, 'success');
    expect(setRecordingBlockCreationStatus).not.toHaveBeenCalledWith(
      7,
      'failed',
      expect.anything()
    );
  });

  test('retries when the active-tab probe rejects', async () => {
    const workspace = createWorkspaceRef();

    isActiveTab
      .mockRejectedValueOnce(new Error('probe failed'))
      .mockResolvedValue(true);
    getCurrentWorkspace.mockReturnValue(workspace.ref);

    const { setupRecordingEvents } =
      await import('../../../electron-renderer/src/app/effects/recording');

    setupRecordingEvents({} as never);

    onRecordingStatusChanged?.({
      id: 9,
      status: 'processing',
      appName: 'Meet',
      filepath: '/tmp/meeting.opus',
      startTime: 1000,
    });

    await Promise.resolve();
    expect(workspace.createDoc).not.toHaveBeenCalled();
    expect(setRecordingBlockCreationStatus).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(workspace.createDoc).toHaveBeenCalledTimes(1);
    expect(setRecordingBlockCreationStatus).toHaveBeenCalledWith(9, 'success');
  });
});
