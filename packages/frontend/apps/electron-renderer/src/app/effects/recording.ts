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
const RECORDING_PROCESS_RETRY_MS = 1000;
const NATIVE_RECORDING_MIME_TYPE = 'audio/ogg';

type ProcessingRecordingStatus = {
  id: number;
  status: 'processing';
  appName?: string;
  blockCreationStatus?: undefined;
  filepath: string;
  startTime: number;
};

type WorkspaceHandle = NonNullable<ReturnType<typeof getCurrentWorkspace>>;

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

function shouldProcessRecording(
  status: unknown
): status is ProcessingRecordingStatus {
  return (
    !!status &&
    typeof status === 'object' &&
    'status' in status &&
    status.status === 'processing' &&
    'filepath' in status &&
    typeof status.filepath === 'string' &&
    !('blockCreationStatus' in status && status.blockCreationStatus)
  );
}

async function createRecordingDoc(
  frameworkProvider: FrameworkProvider,
  workspace: WorkspaceHandle['workspace'],
  status: ProcessingRecordingStatus
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

  await new Promise<void>((resolve, reject) => {
    const docProps: DocProps = {
      onStoreLoad: (doc, { noteId }) => {
        void (async () => {
          // it takes a while to save the blob, so we show the attachment first
          const { blobId, blob } = await saveRecordingBlob(
            doc.workspace.blobSync,
            recordingFilepath
          );

          // name + timestamp(readable) + extension
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
    workspace.scope.get(WorkbenchService).workbench.openDoc(page.id);
  });
}

export function setupRecordingEvents(frameworkProvider: FrameworkProvider) {
  let pendingStatus: ProcessingRecordingStatus | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let processingStatusId: number | null = null;

  const clearRetry = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const clearPending = (id?: number) => {
    if (id === undefined || pendingStatus?.id === id) {
      pendingStatus = null;
      clearRetry();
    }
    if (id === undefined || processingStatusId === id) {
      processingStatusId = null;
    }
  };

  const scheduleRetry = () => {
    if (!pendingStatus || retryTimer !== null) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void processPendingStatus().catch(console.error);
    }, RECORDING_PROCESS_RETRY_MS);
  };

  const processPendingStatus = async () => {
    const status = pendingStatus;
    if (!status || processingStatusId === status.id) {
      return;
    }

    let isActiveTab = false;
    try {
      isActiveTab = !!(await apis?.ui.isActiveTab());
    } catch (error) {
      logger.error('Failed to probe active recording tab', error);
      scheduleRetry();
      return;
    }

    if (!isActiveTab) {
      scheduleRetry();
      return;
    }

    using currentWorkspace = getCurrentWorkspace(frameworkProvider);
    if (!currentWorkspace) {
      // Workspace can lag behind the post-recording status update for a short
      // time; keep retrying instead of permanently failing the import.
      scheduleRetry();
      return;
    }

    processingStatusId = status.id;

    try {
      await createRecordingDoc(
        frameworkProvider,
        currentWorkspace.workspace,
        status
      );
      await apis?.recording.setRecordingBlockCreationStatus(
        status.id,
        'success'
      );
      clearPending(status.id);
    } catch (error) {
      logger.error('Failed to create recording block', error);
      try {
        await apis?.recording.setRecordingBlockCreationStatus(
          status.id,
          'failed',
          error instanceof Error ? error.message : undefined
        );
      } finally {
        clearPending(status.id);
      }
    } finally {
      if (pendingStatus?.id === status.id) {
        processingStatusId = null;
        scheduleRetry();
      }
    }
  };

  events?.recording.onRecordingStatusChanged(status => {
    if (shouldProcessRecording(status)) {
      pendingStatus = status;
      clearRetry();
      void processPendingStatus().catch(console.error);
      return;
    }

    if (!status) {
      clearPending();
      return;
    }

    if (pendingStatus?.id === status.id) {
      clearPending(status.id);
    }
  });
}
