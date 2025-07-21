import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
  nanoid,
} from '@blocksuite/store';

import type { BlockMeta } from '../../utils/types';
import type { ColumnBlockModel } from '../column/column-model';

export type MultiColumnContainerProps = {
  // 可以添加容器级别的属性，比如间距、对齐方式等
} & BlockMeta;

export const MultiColumnContainerBlockSchema = defineBlockSchema({
  flavour: 'affine:multi-column-container',
  props: (): MultiColumnContainerProps => ({}),
  metadata: {
    version: 1,
    role: 'content',
    parent: [
      'affine:note',
      'affine:database',
      'affine:paragraph',
      'affine:list',
      'affine:edgeless-text',
      'affine:callout',
      'affine:column',
    ],
    children: ['affine:column'],
  },
  toModel: () => new MultiColumnContainerBlockModel(),
});

export const MultiColumnContainerBlockSchemaExtension = BlockSchemaExtension(
  MultiColumnContainerBlockSchema
);

export class MultiColumnContainerBlockModel extends BlockModel<MultiColumnContainerProps> {
  override isEmpty(): boolean {
    return this.children.length === 0;
  }

  /**
   * 获取所有列
   */
  get columns(): ColumnBlockModel[] {
    return this.children.filter(
      child => child.flavour === 'affine:column'
    ) as ColumnBlockModel[];
  }

  /**
   * 添加新列
   */
  addColumn(weight?: number, index?: number): string {
    const columnId = nanoid();
    const targetIndex = index ?? this.children.length;

    // 如果没有指定权重，使用默认权重
    const columnWeight = weight ?? this._calculateDefaultWeight();

    this.store.addBlock(
      'affine:column',
      { width: columnWeight },
      this,
      targetIndex
    );

    // 重新分配所有列的宽度，确保总和为100%
    this._redistributeWidthsByWeight();

    return columnId;
  }

  /**
   * 移除列
   */
  removeColumn(columnId: string): void {
    const column = this.store.getModelById(columnId);
    if (column && column.parent === this) {
      this.store.deleteBlock(column);
      // 重新分配剩余列的宽度，确保总和为100%
      this._redistributeWidthsByWeight();
    }
  }

  /**
   * 调整列宽 - 使用权重分配机制
   */
  resizeColumns(columnWidths: { columnId: string; width: number }[]): void {
    this.store.transact(() => {
      // 先更新指定列的权重
      columnWidths.forEach(({ columnId, width }) => {
        const column = this.store.getModelById(columnId) as ColumnBlockModel;
        if (column && column.parent === this) {
          column.setWidth(width);
        }
      });

      // 重新分配所有列的宽度，确保总和为100%
      this._redistributeWidthsByWeight();
    });
  }

  /**
   * 在列之间移动 block
   */
  moveBlockToColumn(
    blockId: string,
    _fromColumnId: string,
    toColumnId: string,
    targetIndex?: number
  ): void {
    const toColumn = this.getColumn(toColumnId);
    if (!toColumn) return;

    const block = this.store.getBlock(blockId);
    if (!block) return;

    const index = targetIndex ?? toColumn.children.length;
    this.store.moveBlocks([block], toColumn, index);
  }

  /**
   * 获取指定列
   */
  getColumn(columnId: string): ColumnBlockModel | null {
    const column = this.store.getModelById(columnId);
    if (
      column &&
      column.flavour === 'affine:column' &&
      column.parent === this
    ) {
      return column as ColumnBlockModel;
    }
    return null;
  }

  /**
   * 计算默认列权重
   */
  private _calculateDefaultWeight(): number {
    const columns = this.columns;
    if (columns.length === 0) {
      return 50; // 第一列默认权重
    }

    // 新列使用平均权重
    const totalWeight = columns.reduce(
      (sum, col) => sum + col.widthPercentage,
      0
    );
    return totalWeight / columns.length;
  }

  /**
   * 重新分配所有列的宽度 - 平均分配
   */
  private _redistributeWidths(): void {
    const columns = this.columns;
    if (columns.length === 0) return;

    const averageWidth = 100 / columns.length;

    this.store.transact(() => {
      columns.forEach(column => {
        column.setWidth(averageWidth);
      });
    });
  }

  /**
   * 根据权重重新分配列宽度，确保总和为100%
   */
  private _redistributeWidthsByWeight(): void {
    const columns = this.columns;
    if (columns.length === 0) return;

    // 计算所有列的权重总和
    const totalWeight = columns.reduce(
      (sum, column) => sum + column.widthPercentage,
      0
    );

    if (totalWeight === 0) {
      // 如果总权重为0，平均分配
      this._redistributeWidths();
      return;
    }

    // 根据权重比例重新计算每列的实际宽度
    this.store.transact(() => {
      columns.forEach(column => {
        const normalizedWidth = (column.widthPercentage / totalWeight) * 100;
        column.setWidth(normalizedWidth);
      });
    });
  }
}
