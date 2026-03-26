import type { DocProps } from '@affine/core/blocksuite/initialization';
import { DocsService } from '@affine/core/modules/doc';
import { AudioAttachmentService } from '@affine/core/modules/media/services/audio-attachment';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { DebugLogger } from '@affine/debug';
import { apis, events } from '@affine/electron-api';
import { i18nTime } from '@affine/i18n';
import track from '@affine/track';
import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import type { Store } from '@blocksuite/affine/store';
import type { BlobEngine } from '@blocksuite/affine/sync';
import type { FrameworkProvider } from '@toeverything/infra';

import { getCurrentWorkspace, isAiEnabled } from './utils';

const logger = new DebugLogger('electron-renderer:recording');
const RECORDING_IMPORT_RETRY_MS = 1000;
const NATIVE_RECORDING_MIME_TYPE = 'audio/ogg';
const TRANSCRIPTION_BLOCK_FLAVOUR = 'affine:transcription';

type TranscriptionBlockModel = {
  props: {
    transcription: {
      sourceAudio?: {
        mimeType?: string;
        durationMs?: number;
        sampleRate?: number;
        channels?: number;
      };
      quality?: { degraded?: boolean; overflowCount?: number };
    };
  };
};

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

function getAttachmentName(status: RecordingImportStatus) {
  const timestamp = i18nTime(status.startTime, {
    absolute: {
      accuracy: 'minute',
      noYear: true,
    },
  });

  return {
    timestamp,
    attachmentName:
      (status.appName ?? 'System Audio') + ' ' + timestamp + '.opus',
  };
}

function ensureNoteId(docStore: Store) {
  const [existingNote] = docStore.getModelsByFlavour('affine:note');
  if (existingNote) {
    return existingNote.id;
  }

  const [page] = docStore.getModelsByFlavour('affine:page');
  if (!page) {
    throw new Error('Recording doc is missing the page block');
  }

  return docStore.addBlock('affine:note', {}, page.id);
}

function findExistingAttachment(docStore: Store, attachmentName: string) {
  return (
    docStore.getModelsByFlavour('affine:attachment') as AttachmentBlockModel[]
  ).find(
    model =>
      model.props.name === attachmentName &&
      model.props.type === NATIVE_RECORDING_MIME_TYPE
  );
}

function ensureTranscriptionBlock(model: AttachmentBlockModel) {
  for (const key of model.childMap.value.keys()) {
    const block = model.store.getBlock$(key);
    if (block?.flavour === TRANSCRIPTION_BLOCK_FLAVOUR) {
      return block.model as unknown as TranscriptionBlockModel;
    }
  }

  const blockId = model.store.addBlock(
    TRANSCRIPTION_BLOCK_FLAVOUR,
    { transcription: {} },
    model.id
  );

  const block = model.store.getBlock(blockId)?.model as
    | TranscriptionBlockModel
    | undefined;
  if (!block) {
    throw new Error('Failed to create transcription block');
  }
  return block;
}

async function createRecordingDoc(
  frameworkProvider: FrameworkProvider,
  workspace: WorkspaceHandle['workspace'],
  status: RecordingImportStatus
) {
  if (!status.docId) {
    throw new Error('Recording import is missing docId');
  }

  const docsService = workspace.scope.get(DocsService);
  const aiEnabled = isAiEnabled(frameworkProvider);
  const { attachmentName, timestamp } = getAttachmentName(status);
  const targetDocId = status.docId;
  const docExists = !!docsService.list.doc$(targetDocId).value;

  if (!docExists) {
    const docProps: DocProps = {};
    docsService.createDoc({
      id: targetDocId,
      docProps,
      title:
        'Recording ' + (status.appName ?? 'System Audio') + ' ' + timestamp,
      primaryMode: 'page',
    });
  }

  const { doc, release } = docsService.open(targetDocId);
  const disposePriorityLoad = doc.addPriorityLoad(10);

  try {
    try {
      await doc.waitForSyncReady();
    } finally {
      disposePriorityLoad();
    }

    const noteId = ensureNoteId(doc.blockSuiteDoc);
    const existingAttachment = findExistingAttachment(
      doc.blockSuiteDoc,
      attachmentName
    );

    let model = existingAttachment;
    let attachmentCreated = false;

    if (!model) {
      const { blobId, blob } = await saveRecordingBlob(
        workspace.docCollection.blobSync,
        status.filepath
      );

      const attachmentId = doc.blockSuiteDoc.addBlock(
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

      model = doc.blockSuiteDoc.getBlock(attachmentId)?.model as
        | AttachmentBlockModel
        | undefined;
      if (!model) {
        throw new Error('Failed to create recording attachment');
      }
      attachmentCreated = true;
    }

    const transcriptionBlock = ensureTranscriptionBlock(model);
    transcriptionBlock.props.transcription = {
      sourceAudio: {
        mimeType: model.props.type,
        durationMs: status.durationMs,
        sampleRate: status.sampleRate,
        channels: status.numberOfChannels,
      },
      quality: {
        degraded: status.degraded,
        overflowCount: status.overflowCount,
      },
    };

    workspace.scope.get(WorkbenchService).workbench.openDoc(targetDocId);

    if (!aiEnabled || !attachmentCreated) {
      return;
    }

    using currentWorkspace = getCurrentWorkspace(frameworkProvider);
    if (!currentWorkspace) {
      return;
    }
    const { workspace: currentWorkspaceEntity } = currentWorkspace;
    using audioAttachment = currentWorkspaceEntity.scope
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
  } finally {
    release();
  }
}

export function setupRecordingEvents(frameworkProvider: FrameworkProvider) {
  let importQueue: RecordingImportStatus[] = [];
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let isProcessingImport = false;
  let hasSeenLiveQueueUpdate = false;

  const clearRetry = () => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const updateQueue = (nextQueue: RecordingImportStatus[]) => {
    importQueue = nextQueue;
  };

  const scheduleRetry = () => {
    if (importQueue.length === 0 || retryTimer !== null) {
      return;
    }
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void processNextImport().catch(console.error);
    }, RECORDING_IMPORT_RETRY_MS);
  };

  const processNextImport = async () => {
    if (isProcessingImport) {
      return;
    }

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

      const workspaceId = currentWorkspace.workspace.id;
      const nextStatus =
        importQueue.find(
          status =>
            status.importStatus === 'pending_import' &&
            (!status.workspaceId || status.workspaceId === workspaceId)
        ) ??
        importQueue.find(
          status =>
            status.importStatus === 'importing' &&
            status.workspaceId === workspaceId
        ) ??
        null;

      if (!nextStatus) {
        return;
      }

      const claimed = await apis?.recording.claimRecordingImport(
        nextStatus.id,
        workspaceId
      );
      if (!claimed) {
        return;
      }

      try {
        await createRecordingDoc(
          frameworkProvider,
          currentWorkspace.workspace,
          claimed
        );
      } catch (error) {
        const importError =
          error instanceof Error
            ? error
            : new Error('Failed to import recording artifact');
        logger.error('Failed to import recording artifact', importError);
        await apis?.recording.failRecordingImport(
          nextStatus.id,
          importError.message
        );
        return;
      }

      try {
        await apis?.recording.completeRecordingImport(nextStatus.id);
      } catch (error) {
        const completionError =
          error instanceof Error
            ? error
            : new Error('Failed to persist recording import completion');
        logger.error(
          'Failed to persist recording import completion',
          completionError
        );
        await apis?.recording.failRecordingImport(
          nextStatus.id,
          completionError.message
        );
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
        if (hasSeenLiveQueueUpdate) {
          return;
        }
        updateQueue(queue ?? []);
        void processNextImport().catch(console.error);
      })
      .catch(error => {
        logger.error('Failed to load recording import queue', error);
      });
  }

  events?.recording.onRecordingImportQueueChanged(queue => {
    hasSeenLiveQueueUpdate = true;
    updateQueue(queue);
    clearRetry();
    void processNextImport().catch(console.error);
  });
}
