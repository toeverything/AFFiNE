import { ListBlockModel } from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import { matchModels } from '@blocksuite/affine-shared/utils';
import type { Command } from '@blocksuite/std';

export const listToParagraphCommand: Command<
  {
    id: string;
    stopCapturing?: boolean;
  },
  {
    listConvertedId: string;
  }
> = (ctx, next) => {
  const { id, stopCapturing = true } = ctx;
  const std = ctx.std;
  const doc = std.store;
  const model = doc.getBlock(id)?.model;

  if (!model || !matchModels(model, [ListBlockModel])) return false;

  const parent = doc.getParent(model);
  if (!parent) return false;

  const index = parent.children.indexOf(model);
  const blockProps = {
    type: 'text' as const,
    text: model.text?.clone(),
    children: model.children,
  };
  if (stopCapturing) std.store.captureSync();
  doc.deleteBlock(model, {
    deleteChildren: false,
  });

  const listConvertedId = doc.addBlock(
    'affine:paragraph',
    blockProps,
    parent,
    index
  );
  focusTextModel(std, listConvertedId);
  return next({ listConvertedId });
};
