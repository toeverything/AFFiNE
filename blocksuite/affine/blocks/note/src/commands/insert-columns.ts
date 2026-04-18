import type { Command } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

export const insertColumnsBlockCommand: Command<
  {
    selectedModels?: BlockModel[];
    columnCount: number;
    place?: 'after' | 'before';
    removeEmptyLine?: boolean;
  },
  {
    insertedColumnsBlockId: string;
  }
> = (ctx, next) => {
  const { selectedModels, columnCount, place, removeEmptyLine, std } = ctx;
  if (!selectedModels?.length || columnCount < 2) {
    return;
  }

  const targetModel =
    place === 'before'
      ? selectedModels[0]
      : selectedModels[selectedModels.length - 1];
  if (!targetModel) {
    return;
  }

  const result = std.store.addSiblingBlocks(
    targetModel,
    [{ flavour: 'affine:columns' }],
    place
  );
  const columnsId = result[0];
  if (!columnsId) {
    return;
  }

  for (let i = 0; i < columnCount; i++) {
    const columnId = std.store.addBlock(
      'affine:column',
      { width: 1 },
      columnsId
    );
    std.store.addBlock('affine:paragraph', {}, columnId);
  }

  if (removeEmptyLine && targetModel.text?.length === 0) {
    std.store.deleteBlock(targetModel);
  }

  next({ insertedColumnsBlockId: columnsId });
};
