import type { Command } from '@blocksuite/std';
import {
  type BlockModel,
  type DraftModel,
  toDraftModel,
} from '@blocksuite/store';

export const draftSelectedModelsCommand: Command<
  {
    selectedModels?: BlockModel[];
  },
  {
    draftedModels: Promise<DraftModel<BlockModel<object>>[]>;
  }
> = (ctx, next) => {
  const models = ctx.selectedModels;
  if (!models) {
    console.error(
      '`selectedModels` is required, you need to use `getSelectedModels` command before adding this command to the pipeline.'
    );
    return;
  }

  const draftedModelsPromise = new Promise<DraftModel[]>(resolve => {
    const draftedModels = models.map(toDraftModel);

    const modelMap = new Map(draftedModels.map(model => [model.id, model]));

    const traverse = (model: DraftModel) => {
      const isDatabase = model.flavour === 'affine:database';
      const children = isDatabase
        ? model.children
        : model.children.filter(child => modelMap.has(child.id));

      children.forEach(child => {
        modelMap.delete(child.id);
        traverse(child);
      });
      model.children = children;
    };

    draftedModels.forEach(traverse);

    const remainingDraftedModels = Array.from(modelMap.values());

    resolve(remainingDraftedModels);
  });

  return next({ draftedModels: draftedModelsPromise });
};
