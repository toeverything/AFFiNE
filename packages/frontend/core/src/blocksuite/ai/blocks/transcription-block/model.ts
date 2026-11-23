import type {
  TranscriptionQualityInput,
  TranscriptionSourceAudioInput,
} from '@affine/graphql';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/affine/store';

export const TranscriptionBlockFlavour = 'affine:transcription';

const defaultProps: TranscriptionBlockProps = {
  transcription: {},
  jobId: undefined,
  createdBy: undefined, // the user id of the creator
};

export const TranscriptionBlockSchema = defineBlockSchema({
  flavour: TranscriptionBlockFlavour,
  props: () => defaultProps,
  metadata: {
    version: 1,
    role: 'attachment-viewer',
    parent: ['affine:attachment'],
    children: ['affine:callout'],
  },
  toModel: () => new TranscriptionBlockModel(),
});

export type TranscriptionBlockProps = {
  transcription: {
    sourceAudio?: TranscriptionSourceAudioInput;
    quality?: TranscriptionQualityInput;
  };
  jobId?: string;
  createdBy?: string;
};

export class TranscriptionBlockModel extends BlockModel<TranscriptionBlockProps> {}

export const TranscriptionBlockSchemaExtension = BlockSchemaExtension(
  TranscriptionBlockSchema
);
