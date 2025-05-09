import type { Command } from '@blocksuite/std';
import { type BlockModel, type DraftModel, Slice } from '@blocksuite/store';

export const copySelectedModelsCommand: Command<{
  draftedModels?: Promise<DraftModel<BlockModel<object>>[]>;
  onCopy?: () => void;
}> = (ctx, next) => {
  const models = ctx.draftedModels;
  if (!models) {
    console.error(
      '`draftedModels` is required, you need to use `draftSelectedModels` command before adding this command to the pipeline.'
    );
    return;
  }

  models
    .then(models => {
      const slice = Slice.fromModels(ctx.std.store, models);

      return ctx.std.clipboard.copy(slice);
    })
    .then(() => ctx.onCopy?.())
    .catch(console.error);
  return next();
};
