import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export const TranscriptionBlockFlavour = 'affine:transcription';

export const TranscriptionBlockSchema = defineBlockSchema({
  flavour: TranscriptionBlockFlavour,
  props: () => ({
    transcription: {},
    jobId: '',
  }),
  metadata: {
    version: 1,
    role: 'attachment-viewer',
    parent: ['affine:attachment'],
    children: ['affine:callout'],
  },
  toModel: () => new TranscriptionBlockModel(),
});

export type TranscriptionBlockProps = {
  transcription: Record<string, any>;
  jobId: string;
};

export class TranscriptionBlockModel extends BlockModel<TranscriptionBlockProps> {}

export const TranscriptionBlockSchemaExtension = BlockSchemaExtension(
  TranscriptionBlockSchema
);
