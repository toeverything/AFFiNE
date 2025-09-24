import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
  type Text,
} from '@blocksuite/store';

import type { Color } from '../../themes/index.js';
import { DefaultTheme } from '../../themes/index.js';
import type { BlockMeta } from '../../utils/types';

export type CalloutProps = {
  emoji: string;
  text: Text;
  background: Color;
} & BlockMeta;

export const CalloutBlockSchema = defineBlockSchema({
  flavour: 'affine:callout',
  props: (internal): CalloutProps => ({
    emoji: '😀',
    text: internal.Text(),
    background: DefaultTheme.NoteBackgroundColorMap.White,
    'meta:createdAt': undefined,
    'meta:updatedAt': undefined,
    'meta:createdBy': undefined,
    'meta:updatedBy': undefined,
  }),
  metadata: {
    version: 1,
    role: 'hub',
    parent: [
      'affine:note',
      'affine:database',
      'affine:paragraph',
      'affine:list',
      'affine:edgeless-text',
      'affine:transcription',
    ],
    children: ['affine:paragraph', 'affine:list'],
  },
  toModel: () => new CalloutBlockModel(),
});

export class CalloutBlockModel extends BlockModel<CalloutProps> {}

export const CalloutBlockSchemaExtension =
  BlockSchemaExtension(CalloutBlockSchema);
