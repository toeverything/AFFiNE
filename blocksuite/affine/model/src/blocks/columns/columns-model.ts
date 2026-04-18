import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export type ColumnsProps = Record<string, never>;

export type ColumnProps = {
  width: number;
};

export const ColumnsBlockSchema = defineBlockSchema({
  flavour: 'affine:columns',
  props: (): ColumnsProps => ({}),
  metadata: {
    version: 1,
    role: 'hub',
    parent: ['affine:note'],
    children: ['affine:column'],
  },
  toModel: () => new ColumnsBlockModel(),
});

export const ColumnBlockSchema = defineBlockSchema({
  flavour: 'affine:column',
  props: (): ColumnProps => ({
    width: 1,
  }),
  metadata: {
    version: 1,
    role: 'hub',
    parent: ['affine:columns'],
    children: [
      '@content',
      'affine:database',
      'affine:data-view',
      'affine:todo-summary',
      'affine:callout',
    ],
  },
  toModel: () => new ColumnBlockModel(),
});

export class ColumnsBlockModel extends BlockModel<ColumnsProps> {}

export class ColumnBlockModel extends BlockModel<ColumnProps> {}

export const ColumnsBlockSchemaExtension =
  BlockSchemaExtension(ColumnsBlockSchema);

export const ColumnBlockSchemaExtension =
  BlockSchemaExtension(ColumnBlockSchema);
