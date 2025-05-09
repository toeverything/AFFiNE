import { type Command, TextSelection } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

export const clearAndSelectFirstModelCommand: Command<{
  selectedModels?: BlockModel[];
}> = (ctx, next) => {
  const models = ctx.selectedModels;

  if (!models) {
    console.error(
      '`selectedModels` is required, you need to use `getSelectedModels` command before adding this command to the pipeline.'
    );
    return;
  }

  if (models.length > 0) {
    const firstModel = models[0];
    if (firstModel.text) {
      firstModel.text.clear();
      const selection = ctx.std.selection.create(TextSelection, {
        from: {
          blockId: firstModel.id,
          index: 0,
          length: 0,
        },
        to: null,
      });
      ctx.std.selection.setGroup('note', [selection]);
    }
  }

  return next();
};
