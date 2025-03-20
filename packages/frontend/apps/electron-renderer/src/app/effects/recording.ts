import type { DocProps } from '@affine/core/blocksuite/initialization';
import { DocsService } from '@affine/core/modules/doc';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { AudioAttachmentService } from '@affine/core/modules/media/services/audio-attachment';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { DebugLogger } from '@affine/debug';
import { apis, events } from '@affine/electron-api';
import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import { Text } from '@blocksuite/affine/store';
import type { BlobEngine } from '@blocksuite/affine/sync';
import type { FrameworkProvider } from '@toeverything/infra';
import { ArrayBufferTarget, Muxer } from 'webm-muxer';

import { getCurrentWorkspace } from './utils';

const logger = new DebugLogger('electron-renderer:recording');

/**
 * Encodes raw audio data to Opus in WebM container.
 */
async function encodeRawBufferToOpus({
  filepath,
  sampleRate,
  numberOfChannels,
}: {
  filepath: string;
  sampleRate: number;
  numberOfChannels: number;
}): Promise<Uint8Array> {
  // Use streams to process audio data incrementally
  const response = await fetch(new URL(filepath, location.origin));
  if (!response.body) {
    throw new Error('Response body is null');
  }

  // Setup Opus encoder
  const encodedChunks: EncodedAudioChunk[] = [];
  const encoder = new AudioEncoder({
    output: chunk => {
      encodedChunks.push(chunk);
    },
    error: err => {
      throw new Error(`Encoding error: ${err}`);
    },
  });

  // Configure Opus encoder
  encoder.configure({
    codec: 'opus',
    sampleRate: sampleRate,
    numberOfChannels: numberOfChannels,
    bitrate: 96000, // 96 kbps is good for stereo audio
  });

  // Process the stream
  const reader = response.body.getReader();
  let offset = 0;
  const CHUNK_SIZE = numberOfChannels * 1024; // Process 1024 samples per channel at a time

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Convert the chunk to Float32Array
      const float32Data = new Float32Array(value.buffer);

      // Process in smaller chunks to avoid large frames
      for (let i = 0; i < float32Data.length; i += CHUNK_SIZE) {
        const chunkSize = Math.min(CHUNK_SIZE, float32Data.length - i);
        const chunk = float32Data.subarray(i, i + chunkSize);

        // Create and encode frame
        const frame = new AudioData({
          format: 'f32',
          sampleRate: sampleRate,
          numberOfFrames: chunk.length / numberOfChannels,
          numberOfChannels: numberOfChannels,
          timestamp: (offset * 1000000) / sampleRate, // timestamp in microseconds
          data: chunk,
        });

        encoder.encode(frame);
        frame.close();

        offset += chunk.length / numberOfChannels;
      }
    }
  } finally {
    await encoder.flush();
    encoder.close();
  }

  if (encodedChunks.length === 0) {
    throw new Error('No chunks were produced during encoding');
  }

  // Initialize WebM muxer
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    audio: {
      codec: 'A_OPUS',
      sampleRate: sampleRate,
      numberOfChannels: numberOfChannels,
    },
  });

  // Add all chunks to the muxer
  for (const chunk of encodedChunks) {
    muxer.addAudioChunk(chunk, {});
  }

  // Finalize and get WebM container
  muxer.finalize();
  const { buffer: webmBuffer } = target;

  return new Uint8Array(webmBuffer);
}

async function saveRecordingBlob(
  blobEngine: BlobEngine,
  recording: {
    id: number;
    filepath: string;
    sampleRate: number;
    numberOfChannels: number;
  }
) {
  logger.debug('Saving recording', recording.id);
  const opusBuffer = await encodeRawBufferToOpus({
    filepath: recording.filepath,
    sampleRate: recording.sampleRate,
    numberOfChannels: recording.numberOfChannels,
  });
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
      if ((await apis?.ui.isActiveTab()) && status?.status === 'stopped') {
        using currentWorkspace = getCurrentWorkspace(frameworkProvider);
        if (!currentWorkspace) {
          return;
        }
        const { workspace } = currentWorkspace;
        const editorSettingService =
          frameworkProvider.get(EditorSettingService);
        const docsService = workspace.scope.get(DocsService);
        const editorSetting = editorSettingService.editorSetting;

        const docProps: DocProps = {
          note: editorSetting.get('affine:note'),
          page: {
            title: new Text(
              'Recording ' +
                (status.appGroup?.name ?? 'System Audio') +
                ' ' +
                new Date(status.startTime).toISOString()
            ),
          },
          onStoreLoad: (doc, { noteId }) => {
            (async () => {
              const recording = await apis?.recording.getRecording(status.id);
              if (!recording) {
                logger.error('Failed to save recording');
                return;
              }

              // name + timestamp(readable) + extension
              const attachmentName =
                (status.appGroup?.name ?? 'System Audio') +
                ' ' +
                new Date(status.startTime).toISOString() +
                '.webm';

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

              if (model) {
                // it takes a while to save the blob, so we show the attachment first
                const { blobId, blob } = await saveRecordingBlob(
                  doc.workspace.blobSync,
                  recording
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
