import type { Text } from '@blocksuite/store';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

import type { TextAlign } from '../../consts';
import type { BlockMeta } from '../../utils/types';

// `toggle` type has been deprecated, do not use it
export type ListType = 'bulleted' | 'numbered' | 'todo' | 'toggle';

export type ListProps = {
  type: ListType;
  text: Text;
  todoListTitle?: string;
  todoFieldDefs?: Array<{
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'progress';
  }>;
  todoFieldLayout?: 'inline' | 'aligned' | 'right';
  todoFieldValues?: Record<string, string | number>;
  todoDatabaseStatusMapping?: {
    statusColumnName: string;
    doneTagLabel: string;
    notDoneTagLabel?: string;
  };
  textAlign?: TextAlign;
  checked: boolean;
  collapsed: boolean;
  order: number | null;
  comments?: Record<string, boolean>;
} & BlockMeta;

export const ListBlockSchema = defineBlockSchema({
  flavour: 'affine:list',
  props: internal =>
    ({
      type: 'bulleted',
      text: internal.Text(),
      todoListTitle: undefined,
      todoFieldDefs: undefined,
      todoFieldLayout: undefined,
      todoFieldValues: undefined,
      todoDatabaseStatusMapping: undefined,
      textAlign: undefined,
      checked: false,
      collapsed: false,

      // number type only for numbered list
      order: null,
      comments: undefined,
      'meta:createdAt': undefined,
      'meta:createdBy': undefined,
      'meta:updatedAt': undefined,
      'meta:updatedBy': undefined,
    }) as ListProps,
  metadata: {
    version: 1,
    role: 'content',
    parent: [
      'affine:note',
      'affine:database',
      'affine:list',
      'affine:paragraph',
      'affine:edgeless-text',
      'affine:callout',
    ],
  },
  toModel: () => new ListBlockModel(),
});

export const ListBlockSchemaExtension = BlockSchemaExtension(ListBlockSchema);

export class ListBlockModel extends BlockModel<ListProps> {}
