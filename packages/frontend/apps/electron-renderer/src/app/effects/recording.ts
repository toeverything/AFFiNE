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
    type: 'audio/mp4',
  });
  const blobId = await blobEngine.set(blob);
  logger.debug('Recording saved', blobId);
  return { blob, blobId };
}

export function setupRecordingEvents(frameworkProvider: FrameworkProvider) {
  events?.recording.onRecordingStatusChanged(status => {
    (async () => {
      if ((await apis?.ui.isActiveTab()) && status?.status === 'ready') {
        using currentWorkspace = getCurrentWorkspace(frameworkProvider);
        if (!currentWorkspace) {
          // maybe the workspace is not ready yet, eg. for shared workspace view
          await apis?.recording.handleBlockCreationFailed(status.id);
          return;
        }
        const { workspace } = currentWorkspace;
        const docsService = workspace.scope.get(DocsService);
        const aiEnabled = isAiEnabled(frameworkProvider);

        const timestamp = i18nTime(status.startTime, {
          absolute: {
            accuracy: 'minute',
            noYear: true,
          },
        });

        const docProps: DocProps = {
          onStoreLoad: (doc, { noteId }) => {
            (async () => {
              if (status.filepath) {
                // it takes a while to save the blob, so we show the attachment first
                const { blobId, blob } = await saveRecordingBlob(
                  doc.workspace.blobSync,
                  status.filepath
                );

                // name + timestamp(readable) + extension
                const attachmentName =
                  (status.appName ?? 'System Audio') +
                  ' ' +
                  timestamp +
                  '.opus';

                // add size and sourceId to the attachment later
                const attachmentId = doc.addBlock(
                  'affine:attachment',
                  {
                    name: attachmentName,
                    type: 'audio/opus',
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
              } else {
                throw new Error('No attachment model found');
              }
            })()
              .then(async () => {
                await apis?.recording.handleBlockCreationSuccess(status.id);
              })
              .catch(error => {
                logger.error('Failed to transcribe recording', error);
                return apis?.recording.handleBlockCreationFailed(
                  status.id,
                  error
                );
              })
              .catch(error => {
                console.error('unknown error', error);
              });
          },
        };
        const page = docsService.createDoc({
          docProps,
          title:
            'Recording ' + (status.appName ?? 'System Audio') + ' ' + timestamp,
          primaryMode: 'page',
        });
        workspace.scope.get(WorkbenchService).workbench.openDoc(page.id);
      }
    })().catch(console.error);
  });
}
