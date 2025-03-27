import type { DocProps } from '@affine/core/blocksuite/initialization';
import { DocsService } from '@affine/core/modules/doc';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { AudioAttachmentService } from '@affine/core/modules/media/services/audio-attachment';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { DebugLogger } from '@affine/debug';
import { apis, events } from '@affine/electron-api';
import { i18nTime } from '@affine/i18n';
import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import { Text } from '@blocksuite/affine/store';
import type { BlobEngine } from '@blocksuite/affine/sync';
import type { FrameworkProvider } from '@toeverything/infra';

import { getCurrentWorkspace } from './utils';

const logger = new DebugLogger('electron-renderer:recording');

async function saveRecordingBlob(blobEngine: BlobEngine, filepath: string) {
  logger.debug('Saving recording', filepath);
  const opusBuffer = await fetch(new URL(filepath, location.origin)).then(res =>
    res.arrayBuffer()
  );
  const blob = new Blob([opusBuffer], {
    type: 'audio/webm',
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
          return;
        }
        const { workspace } = currentWorkspace;
        const editorSettingService =
          frameworkProvider.get(EditorSettingService);
        const docsService = workspace.scope.get(DocsService);
        const editorSetting = editorSettingService.editorSetting;

        const timestamp = i18nTime(status.startTime, {
          absolute: {
            accuracy: 'minute',
            noYear: true,
          },
        });

        const docProps: DocProps = {
          note: editorSetting.get('affine:note'),
          page: {
            title: new Text(
              'Recording ' +
                (status.appName ?? 'System Audio') +
                ' ' +
                timestamp
            ),
          },
          onStoreLoad: (doc, { noteId }) => {
            (async () => {
              // name + timestamp(readable) + extension
              const attachmentName =
                (status.appName ?? 'System Audio') + ' ' + timestamp + '.webm';

              // add size and sourceId to the attachment later
              const attachmentId = doc.addBlock(
                'affine:attachment',
                {
                  name: attachmentName,
                  type: 'audio/webm',
                },
                noteId
              );

              const model = doc.getBlock(attachmentId)
                ?.model as AttachmentBlockModel;

              if (model && status.filepath) {
                // it takes a while to save the blob, so we show the attachment first
                const { blobId, blob } = await saveRecordingBlob(
                  doc.workspace.blobSync,
                  status.filepath
                );

                model.props.size = blob.size;
                model.props.sourceId = blobId;
                model.props.embed = true;

                using currentWorkspace = getCurrentWorkspace(frameworkProvider);
                if (!currentWorkspace) {
                  return;
                }
                const { workspace } = currentWorkspace;
                using audioAttachment = workspace.scope
                  .get(AudioAttachmentService)
                  .get(model);
                audioAttachment?.obj.transcribe();
              }
            })().catch(console.error);
          },
        };
        const page = docsService.createDoc({ docProps, primaryMode: 'page' });
        workspace.scope.get(WorkbenchService).workbench.openDoc(page.id);
      }
    })().catch(console.error);
  });
}
