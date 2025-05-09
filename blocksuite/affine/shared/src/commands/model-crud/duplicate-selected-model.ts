import type { Command } from '@blocksuite/std';
import { type BlockModel, Slice } from '@blocksuite/store';

import { draftSelectedModelsCommand } from './draft-selected-models';

/**
 * @description Duplicate the selected models
 * @param selectedModels - The selected models for duplicate
 * @param parentModel - The parent model of duplicated models, default is the last selected model's parent model
 * @param index - The index of the duplicated models in the parent model, default is the last selected model's index + 1
 */
export const duplicateSelectedModelsCommand: Command<{
  selectedModels?: BlockModel[];
  parentModel?: BlockModel;
  index?: number;
}> = (ctx, next) => {
  const { std, selectedModels } = ctx;
  let { parentModel, index } = ctx;
  if (!selectedModels) return;

  const [_, { draftedModels }] = ctx.std.command.exec(
    draftSelectedModelsCommand,
    { selectedModels }
  );
  if (!draftedModels) return;

  if (parentModel) {
    if (
      index === undefined ||
      index < 0 ||
      index >= parentModel.children.length
    ) {
      index = parentModel.children.length;
    }
  } else {
    const model = selectedModels[selectedModels.length - 1];
    parentModel = std.store.getParent(model.id) ?? undefined;
    if (!parentModel) return;
    index = parentModel.children.findIndex(x => x.id === model.id) + 1;
  }

  draftedModels
    .then(models => {
      const slice = Slice.fromModels(std.store, models);
      return std.clipboard.duplicateSlice(
        slice,
        std.store,
        parentModel.id,
        index
      );
    })
    .catch(console.error);

  return next();
};
