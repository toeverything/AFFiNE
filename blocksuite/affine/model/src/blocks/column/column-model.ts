import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

import type { BlockMeta } from '../../utils/types';

export type ColumnProps = {
  width: number; // 百分比宽度
} & BlockMeta;

export const ColumnBlockSchema = defineBlockSchema({
  flavour: 'affine:column',
  props: (): ColumnProps => ({
    width: 50, // 默认 50% 宽度
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:multi-column-container'],
    children: [
      '@content',
      'affine:database',
      'affine:data-view',
      'affine:callout',
    ],
  },
  toModel: () => new ColumnBlockModel(),
});

export const ColumnBlockSchemaExtension =
  BlockSchemaExtension(ColumnBlockSchema);

export class ColumnBlockModel extends BlockModel<ColumnProps> {
  override isEmpty(): boolean {
    return this.children.length === 0;
  }

  /**
   * 获取列的宽度百分比
   */
  get widthPercentage(): number {
    return this.props.width;
  }

  /**
   * 设置列的宽度
   */
  setWidth(width: number): void {
    this.store.updateBlock(this, { width });
  }

  /**
   * 添加 block 到列中
   */
  addBlock(blockId: string, index?: number): void {
    const targetIndex = index ?? this.children.length;
    const block = this.store.getBlock(blockId);
    if (block) {
      this.store.moveBlocks([block], this, targetIndex);
    }
  }

  /**
   * 从列中移除 block
   */
  removeBlock(blockId: string): void {
    const block = this.store.getModelById(blockId);
    if (block && block.parent === this) {
      this.store.deleteBlock(block);
    }
  }
}
