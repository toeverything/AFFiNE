import type { IconData } from '@blocksuite/affine-shared/services';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
  type Text,
} from '@blocksuite/store';

import type { BlockMeta } from '../../utils/types';

export type CalloutProps = {
  icon?: IconData;
  text: Text;
  backgroundColorName?: string;
} & BlockMeta;

export const CalloutBlockSchema = defineBlockSchema({
  flavour: 'affine:callout',
  props: (internal): CalloutProps => ({
    icon: { type: 'emoji', unicode: '💡' } as IconData,
    text: internal.Text(),
    backgroundColorName: 'grey',
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
