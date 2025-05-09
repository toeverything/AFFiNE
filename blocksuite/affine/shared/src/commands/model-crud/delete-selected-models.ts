import type { Command } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

export const deleteSelectedModelsCommand: Command<{
  selectedModels?: BlockModel[];
}> = (ctx, next) => {
  const models = ctx.selectedModels;

  if (!models) {
    console.error(
      '`selectedModels` is required, you need to use `getSelectedModels` command before adding this command to the pipeline.'
    );
    return;
  }

  models.forEach(model => {
    ctx.std.store.deleteBlock(model);
  });

  return next();
};
