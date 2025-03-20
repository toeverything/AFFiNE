import {
  type AttachmentBlockModel,
  TranscriptionBlockFlavour,
  type TranscriptionBlockModel,
} from '@blocksuite/affine/model';
import type { AffineTextAttributes } from '@blocksuite/affine/shared/types';
import { type DeltaInsert, Text } from '@blocksuite/affine/store';
import { computed } from '@preact/signals-core';
import {
  catchErrorInto,
  effect,
  Entity,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { EMPTY, mergeMap, switchMap } from 'rxjs';

import type { AudioMediaManagerService } from '../services/audio-media-manager';
import type { AudioMedia } from './audio-media';

export interface TranscriptionResult {
  title: string;
  summary: string;
  segments: {
    speaker: string;
    start_time: string;
    end_time: string;
    transcription: string;
  }[];
}

// BlockSuiteError: yText must not contain "\r" because it will break the range synchronization
function sanitizeText(text: string) {
  return text.replace(/\r/g, '');
}

export class AudioAttachmentBlock extends Entity<AttachmentBlockModel> {
  private readonly refCount$ = new LiveData<number>(0);
  readonly audioMedia: AudioMedia;
  constructor(
    public readonly audioMediaManagerService: AudioMediaManagerService
  ) {
    super();
    const mediaRef = audioMediaManagerService.ensureMediaEntity(this.props);
    this.audioMedia = mediaRef.media;
    this.disposables.push(() => mediaRef.release());
  }

  // rendering means the attachment is visible in the editor
  rendering$ = this.refCount$.map(refCount => refCount > 0);
  expanded$ = new LiveData<boolean>(true);
  transcribing$ = new LiveData<boolean>(false);
  transcriptionError$ = new LiveData<Error | null>(null);
  transcribed$ = LiveData.computed(get => {
    const transcriptionBlock = get(this.transcriptionBlock$);
    if (!transcriptionBlock) {
      return null;
    }
    const childMap = get(LiveData.fromSignal(transcriptionBlock.childMap));
    return childMap.size > 0;
  });

  transcribe = effect(
    switchMap(() =>
      fromPromise(this.doTranscribe()).pipe(
        mergeMap(result => {
          // attach transcription result to the block
          this.fillTranscriptionResult(result);
          return EMPTY;
        }),
        catchErrorInto(this.transcriptionError$),
        onStart(() => this.transcribing$.setValue(true)),
        onComplete(() => this.transcribing$.setValue(false))
      )
    )
  );

  readonly transcriptionBlock$ = LiveData.fromSignal(
    computed(() => {
      // find the last transcription block
      for (const key of [...this.props.childMap.value.keys()].reverse()) {
        const block = this.props.doc.getBlock$(key);
        if (block?.flavour === TranscriptionBlockFlavour) {
          return block.model as unknown as TranscriptionBlockModel;
        }
      }
      return null;
    })
  );

  // TODO: use real implementation
  private readonly doTranscribe = async (): Promise<TranscriptionResult> => {
    try {
      const buffer = await this.audioMedia.getBuffer();
      if (!buffer) {
        throw new Error('No audio buffer available');
      }

      // Send binary audio data directly
      const blob = new Blob([buffer], { type: 'audio/wav' }); // adjust mime type if needed
      const formData = new FormData();
      formData.append('audio', blob);

      const response = await fetch('http://localhost:6544/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.transcription;
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw error;
    }
  };

  private readonly fillTranscriptionResult = (result: TranscriptionResult) => {
    this.props.props.caption = result.title;
    // todo: add transcription block schema etc.
    const transcriptionBlockId = this.props.doc.addBlock(
      'affine:transcription',
      {
        transcription: result,
      },
      this.props.id
    );

    const calloutId = this.props.doc.addBlock(
      'affine:callout',
      {
        emoji: '💬',
      },
      transcriptionBlockId
    );

    // todo: refactor
    const spearkerToColors = new Map<string, string>();
    for (const segment of result.segments) {
      let color = spearkerToColors.get(segment.speaker);
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
      if (!color) {
        color = colorOptions[spearkerToColors.size % colorOptions.length];
        spearkerToColors.set(segment.speaker, color);
      }
      const deltaInserts: DeltaInsert<AffineTextAttributes>[] = [
        {
          insert: sanitizeText(segment.start_time + ' ' + segment.speaker),
          attributes: {
            color,
            bold: true,
          },
        },
        {
          insert: ': ' + sanitizeText(segment.transcription),
        },
      ];
      this.props.doc.addBlock(
        'affine:paragraph',
        {
          text: new Text(deltaInserts),
        },
        calloutId
      );
    }
  };

  mount() {
    this.refCount$.setValue(this.refCount$.value + 1);
  }

  unmount() {
    this.refCount$.setValue(this.refCount$.value - 1);
  }
}
