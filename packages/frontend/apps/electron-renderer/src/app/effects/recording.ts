import type { DocProps } from '@affine/core/blocksuite/initialization';
import { DocsService } from '@affine/core/modules/doc';
import { AudioAttachmentService } from '@affine/core/modules/media/services/audio-attachment';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { DebugLogger } from '@affine/debug';
import { apis, events } from '@affine/electron-api';
import { i18nTime } from '@affine/i18n';
import track from '@affine/track';
import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import type { BlobEngine } from '@blocksuite/affine/sync';
import type { FrameworkProvider } from '@toeverything/infra';

import { getCurrentWorkspace, isAiEnabled } from './utils';

const logger = new DebugLogger('electron-renderer:recording');
const RECORDING_IMPORT_RETRY_MS = 1000;
const NATIVE_RECORDING_MIME_TYPE = 'audio/ogg';

type RecordingImportStatus = {
  id: number;
  appName?: string;
  filepath: string;
  startTime: number;
  importStatus: 'pending_import' | 'importing' | 'imported' | 'import_failed';
};

type WorkspaceHandle = NonNullable<ReturnType<typeof getCurrentWorkspace>>;

class RecordingImportTerminalError extends Error {
  override readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'RecordingImportTerminalError';
    this.cause = cause;
  }
}

async function readRecordingFile(filepath: string) {
  if (apis?.recording?.readRecordingFile) {
    try {
      return await apis.recording.readRecordingFile(filepath);
    } catch (error) {
      logger.error(
        'Failed to read recording file via IPC, fallback to fetch',
        error
      );
    }
  }

  const fileUrl = new URL(
    filepath,
    typeof location !== 'undefined' && location.protocol === 'assets:'
      ? 'assets://local-file'
      : location.origin
  );
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch recording file: ${response.status} ${response.statusText}`
    );
  }
  return response.arrayBuffer();
}

async function saveRecordingBlob(blobEngine: BlobEngine, filepath: string) {
  logger.debug('Saving recording', filepath);
  const opusBuffer = await readRecordingFile(filepath);
  const blob = new Blob([opusBuffer], {
    type: NATIVE_RECORDING_MIME_TYPE,
  });
  const blobId = await blobEngine.set(blob);
  logger.debug('Recording saved', blobId);
  return { blob, blobId };
}

async function createRecordingDoc(
  frameworkProvider: FrameworkProvider,
  workspace: WorkspaceHandle['workspace'],
  status: RecordingImportStatus
) {
  const docsService = workspace.scope.get(DocsService);
  const aiEnabled = isAiEnabled(frameworkProvider);
  const recordingFilepath = status.filepath;

  const timestamp = i18nTime(status.startTime, {
    absolute: {
      accuracy: 'minute',
      noYear: true,
    },
  });

  let docCreated = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const docProps: DocProps = {
        onStoreLoad: (doc, { noteId }) => {
          void (async () => {
            const { blobId, blob } = await saveRecordingBlob(
              doc.workspace.blobSync,
              recordingFilepath
            );

            const attachmentName =
              (status.appName ?? 'System Audio') + ' ' + timestamp + '.opus';

            const attachmentId = doc.addBlock(
              'affine:attachment',
              {
                name: attachmentName,
                type: NATIVE_RECORDING_MIME_TYPE,
                size: blob.size,
                sourceId: blobId,
                embed: true,
              },
              noteId
            );

            const model = doc.getBlock(attachmentId)
              ?.model as AttachmentBlockModel;

            if (!aiEnabled) {
              return;
            }

            using currentWorkspace = getCurrentWorkspace(frameworkProvider);
            if (!currentWorkspace) {
              return;
            }
            const { workspace } = currentWorkspace;
            using audioAttachment = workspace.scope
              .get(AudioAttachmentService)
              .get(model);
            audioAttachment?.obj
              .transcribe()
              .then(() => {
                track.doc.editor.audioBlock.transcribeRecording({
                  type: 'Meeting record',
                  method: 'success',
                  option: 'Auto transcribing',
                });
              })
              .catch(err => {
                logger.error('Failed to transcribe recording', err);
              });
          })().then(resolve, reject);
        },
      };

      const page = docsService.createDoc({
        docProps,
        title:
          'Recording ' + (status.appName ?? 'System Audio') + ' ' + timestamp,
        primaryMode: 'page',
      });
      docCreated = true;
      workspace.scope.get(WorkbenchService).workbench.openDoc(page.id);
    });
  } catch (error) {
    if (docCreated) {
      throw new RecordingImportTerminalError(
        `Recording import created a document before failing: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
        error
      );
    }
    throw error;
  }
}

export function setupRecordingEvents(frameworkProvider: FrameworkProvider) {
  let importQueue: RecordingImportStatus[] = [];
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let isProcessingImport = false;
  let processingStatusId: number | null = null;

  const clearRetry = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const updateQueue = (nextQueue: RecordingImportStatus[]) => {
    importQueue = nextQueue;
    if (
      processingStatusId !== null &&
      !importQueue.some(
        status =>
          status.id === processingStatusId &&
          status.importStatus === 'importing'
      )
    ) {
      processingStatusId = null;
    }
  };

  const updateLocalImportStatus = (
    id: number,
    importStatus: RecordingImportStatus['importStatus']
  ) => {
    importQueue = importQueue.map(status =>
      status.id === id ? { ...status, importStatus } : status
    );
  };

  const getNextImportCandidate = () =>
    importQueue.find(status => status.importStatus === 'pending_import') ??
    null;

  const scheduleRetry = () => {
    if (!getNextImportCandidate() || retryTimer !== null) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void processNextImport().catch(console.error);
    }, RECORDING_IMPORT_RETRY_MS);
  };

  const processNextImport = async () => {
    if (isProcessingImport) return;
    const status = getNextImportCandidate();
    if (!status) return;

    isProcessingImport = true;
    try {
      let isActiveTab = false;
      try {
        isActiveTab = !!(await apis?.ui.isActiveTab());
      } catch (error) {
        logger.error('Failed to probe active recording tab', error);
        return;
      }

      if (!isActiveTab) {
        return;
      }

      using currentWorkspace = getCurrentWorkspace(frameworkProvider);
      if (!currentWorkspace) {
        return;
      }

      const claimed = await apis?.recording.claimRecordingImport(status.id);
      if (!claimed) {
        return;
      }

      processingStatusId = status.id;

      try {
        await createRecordingDoc(
          frameworkProvider,
          currentWorkspace.workspace,
          claimed
        );
        updateLocalImportStatus(status.id, 'imported');
        await apis?.recording.completeRecordingImport(status.id);
      } catch (error) {
        const importError =
          error instanceof RecordingImportTerminalError
            ? error
            : error instanceof Error
              ? error
              : new Error('Failed to import recording artifact');
        logger.error('Failed to import recording artifact', importError);
        updateLocalImportStatus(status.id, 'import_failed');
        await apis?.recording.failRecordingImport(
          status.id,
          importError.message
        );
      } finally {
        processingStatusId = null;
      }
    } finally {
      isProcessingImport = false;
      scheduleRetry();
    }
  };

  if (apis?.recording) {
    void apis.recording
      .getRecordingImportQueue()
      .then(queue => {
        updateQueue(queue ?? []);
        void processNextImport().catch(console.error);
      })
      .catch(error => {
        logger.error('Failed to load recording import queue', error);
      });
  }

  events?.recording.onRecordingImportQueueChanged(queue => {
    updateQueue(queue);
    clearRetry();
    void processNextImport().catch(console.error);
  });
}
