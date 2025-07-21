import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
  nanoid,
} from '@blocksuite/store';

// 列配置接口
interface ColumnConfig {
  columnId: string;
  width: number; // 百分比宽度
  blocks: string[]; // 该列包含的 block ID 列表
}

// Multi-column block 的属性
interface MultiColumnBlockProps {
  columns: ColumnConfig[];
}

// 定义 Multi-column block 的 schema
export const MultiColumnBlockSchema = defineBlockSchema({
  flavour: 'affine:multi-column',
  props: (): MultiColumnBlockProps => ({
    columns: [
      {
        columnId: nanoid(),
        width: 50,
        blocks: [],
      },
      {
        columnId: nanoid(),
        width: 50,
        blocks: [],
      },
    ],
  }),
  metadata: {
    version: 1,
    role: 'content',
    children: [
      '@content',
      'affine:database',
      'affine:data-view',
      'affine:callout',
    ],
  },
});

export class MultiColumnBlockModel extends BlockModel<MultiColumnBlockProps> {
  get columns(): ColumnConfig[] {
    return this.props.columns;
  }
}

export const MultiColumnBlockSchemaExtension = BlockSchemaExtension(
  MultiColumnBlockSchema
);
