import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export const LayoutRowBlockSchema = defineBlockSchema({
  flavour: 'affine:layout-row',
  metadata: {
    version: 1,
    role: 'content',
    children: ['affine:layout-column'],
  },
  toModel: () => new LayoutRowBlockModel(),
});

type Props = {
  columns: number;
};

export class LayoutRowBlockModel extends BlockModel<Props> {}

export const LayoutRowBlockSchemaExtension =
  BlockSchemaExtension(LayoutRowBlockSchema);
