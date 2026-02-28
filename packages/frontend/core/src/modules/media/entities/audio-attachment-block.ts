import {
  TranscriptionBlockFlavour,
  type TranscriptionBlockModel,
} from '@affine/core/blocksuite/ai/blocks/transcription-block/model';
import { insertFromMarkdown } from '@affine/core/blocksuite/utils';
import { encodeAudioBlobToOpusSlices } from '@affine/core/utils/opus-encoding';
import { DebugLogger } from '@affine/debug';
import { AiJobStatus } from '@affine/graphql';
import track from '@affine/track';
import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import type { AffineTextAttributes } from '@blocksuite/affine/shared/types';
import { type DeltaInsert, Text } from '@blocksuite/affine/store';
import { computed } from '@preact/signals-core';
import { Entity, LiveData } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';

import type { WorkspaceService } from '../../workspace';
import type { AudioMediaManagerService } from '../services/audio-media-manager';
import type { MeetingSettingsService } from '../services/meeting-settings';
import type { AudioMedia } from './audio-media';
import { AudioTranscriptionJob } from './audio-transcription-job';
import type { TranscriptionResult } from './types';

const logger = new DebugLogger('audio-attachment-block');

// BlockSuiteError: yText must not contain "\r" because it will break the range synchronization
function sanitizeText(text: string) {
  return text.replace(/\r/g, '');
}

const colorOptions = [
  cssVarV2.text.highlight.fg.red,
  cssVarV2.text.highlight.fg.green,
  cssVarV2.text.highlight.fg.blue,
  cssVarV2.text.highlight.fg.yellow,
  cssVarV2.text.highlight.fg.purple,
  cssVarV2.text.highlight.fg.orange,
  cssVarV2.text.highlight.fg.teal,
  cssVarV2.text.highlight.fg.grey,
  cssVarV2.text.highlight.fg.magenta,
];

export class AudioAttachmentBlock extends Entity<AttachmentBlockModel> {
  private readonly refCount$ = new LiveData<number>(0);
  readonly audioMedia: AudioMedia;
  constructor(
    readonly audioMediaManagerService: AudioMediaManagerService,
    readonly workspaceService: WorkspaceService,
    readonly meetingSettingsService: MeetingSettingsService
  ) {
    super();
    const mediaRef = audioMediaManagerService.ensureMediaEntity(this.props);
    this.audioMedia = mediaRef.media;
    this.disposables.push(() => mediaRef.release());
    this.disposables.push(() => {
      this.transcriptionJob.dispose();
    });
  }

  // rendering means the attachment is visible in the editor
  // it is used to determine if we should show show the audio player on the sidebar
  rendering$ = this.refCount$.map(refCount => refCount > 0);
  expanded$ = new LiveData<boolean>(true);

  readonly transcriptionBlock$ = LiveData.fromSignal(
    computed(() => {
      // find the last transcription block
      for (const key of [...this.props.childMap.value.keys()].reverse()) {
        const block = this.props.store.getBlock$(key);
        if (block?.flavour === TranscriptionBlockFlavour) {
          return block.model as unknown as TranscriptionBlockModel;
        }
      }
      return null;
    })
  );

  hasTranscription$ = LiveData.computed(get => {
    const transcriptionBlock = get(this.transcriptionBlock$);
    if (!transcriptionBlock) {
      return null;
    }
    const childMap = get(LiveData.fromSignal(transcriptionBlock.childMap));
    return childMap.size > 0;
  });

  transcriptionJob: AudioTranscriptionJob = this.createTranscriptionJob();

  mount() {
    if (
      this.transcriptionJob.isCreator() &&
      this.transcriptionJob.status$.value.status === 'waiting-for-job' &&
      !this.hasTranscription$.value
    ) {
      this.transcribe().catch(error => {
        logger.error('Error transcribing audio:', error);
      });
    }

    this.refCount$.setValue(this.refCount$.value + 1);
  }

  unmount() {
    this.refCount$.setValue(this.refCount$.value - 1);
  }

  private createTranscriptionJob() {
    if (!this.props.props.sourceId) {
      throw new Error('No source id');
    }

    let transcriptionBlockProps = this.transcriptionBlock$.value?.props;

    if (!transcriptionBlockProps) {
      // transcription block is not created yet, we need to create it
      this.props.store.addBlock(
        'affine:transcription',
        {
          transcription: {},
        },
        this.props.id
      );
      transcriptionBlockProps = this.transcriptionBlock$.value?.props;
    }

    if (!transcriptionBlockProps) {
      throw new Error('No transcription block props');
    }

    const job = this.framework.createEntity(AudioTranscriptionJob, {
      blobId: this.props.props.sourceId,
      blockProps: transcriptionBlockProps,
      getAudioFiles: async () => {
        const buffer = await this.audioMedia.getBuffer();
        if (!buffer) {
          throw new Error('No audio buffer available');
        }
        const slices = await encodeAudioBlobToOpusSlices(buffer, 64000);
        const files = slices.map((slice, index) => {
          const blob = new Blob([slice], { type: 'audio/opus' });
          return new File([blob], this.props.props.name + `-${index}.opus`, {
            type: 'audio/opus',
          });
        });
        return files;
      },
    });

    return job;
  }

  readonly transcribe = async () => {
    try {
      // if job is already running, we should not start it again
      if (this.transcriptionJob.status$.value.status !== 'waiting-for-job') {
        return;
      }
      const status = await this.transcriptionJob.start();
      if (status.status === AiJobStatus.claimed) {
        await this.fillTranscriptionResult(status.result);
      }
    } catch (error) {
      track.doc.editor.audioBlock.transcribeRecording({
        type: 'Meeting record',
        method: 'fail',
      });
      logger.error('Error transcribing audio:', error);
      throw error;
    }
  };

  private readonly fillTranscriptionResult = async (
    result: TranscriptionResult
  ) => {
    this.props.props.caption = result.title ?? '';

    const addCalloutBlock = (
      emoji: string,
      title: string,
      collapsed: boolean = false
    ) => {
      const calloutId = this.props.store.addBlock(
        'affine:callout',
        {
          emoji,
        },
        this.transcriptionBlock$.value?.id
      );
      this.props.store.addBlock(
        'affine:paragraph',
        {
          type: 'h6',
          collapsed,
          text: new Text([
            {
              insert: title,
            },
          ]),
        },
        calloutId
      );
      return calloutId;
    };
    const fillTranscription = (segments: TranscriptionResult['segments']) => {
      const calloutId = addCalloutBlock('💬', 'Transcript', true);

      const speakerToColors = new Map<string, string>();
      for (const segment of segments) {
        let color = speakerToColors.get(segment.speaker);
        if (!color) {
          color = colorOptions[speakerToColors.size % colorOptions.length];
          speakerToColors.set(segment.speaker, color);
        }
        const deltaInserts: DeltaInsert<AffineTextAttributes>[] = [
          {
            insert: sanitizeText(segment.start + ' ' + segment.speaker),
            attributes: {
              color,
              bold: true,
            },
          },
          {
            insert: ': ' + sanitizeText(segment.transcription),
          },
        ];
        this.props.store.addBlock(
          'affine:paragraph',
          {
            text: new Text(deltaInserts),
          },
          calloutId
        );
      }
    };

    const fillSummary = async (summary: TranscriptionResult['summary']) => {
      const calloutId = addCalloutBlock('📑', 'Summary');
      await insertFromMarkdown(
        undefined,
        summary,
        this.props.store,
        calloutId,
        1
      );
    };

    const fillActions = async (actions: TranscriptionResult['actions']) => {
      if (!actions) {
        return;
      }
      const calloutId = addCalloutBlock('🎯', 'Todo');
      await insertFromMarkdown(
        undefined,
        actions ?? '',
        this.props.store,
        calloutId,
        1
      );
    };
    fillTranscription(result.segments);
    if (this.meetingSettingsService.settings.autoTranscriptionSummary) {
      await fillSummary(result.summary);
    }
    if (this.meetingSettingsService.settings.autoTranscriptionTodo) {
      await fillActions(result.actions);
    }
  };
}
