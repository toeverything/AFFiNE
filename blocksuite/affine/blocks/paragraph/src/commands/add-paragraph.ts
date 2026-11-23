import { focusTextModel } from '@blocksuite/affine-rich-text';
import { type Command, TextSelection } from '@blocksuite/std';

/**
 * Add a paragraph next to the current block.
 */
export const addParagraphCommand: Command<
  {
    blockId?: string;
  },
  {
    paragraphConvertedId: string;
  }
> = (ctx, next) => {
  const { std } = ctx;
  const { store, selection } = std;
  store.captureSync();

  let blockId = ctx.blockId;
  if (!blockId) {
    const text = selection.find(TextSelection);
    blockId = text?.blockId;
  }
  if (!blockId) return;

  const model = store.getBlock(blockId)?.model;
  if (!model) return;

  let id: string;
  if (model.children.length > 0) {
    // before:
    // aaa|
    //   bbb
    //
    // after:
    // aaa
    //   |
    //   bbb
    id = store.addBlock('affine:paragraph', {}, model, 0);
  } else {
    const parent = store.getParent(model);
    if (!parent) return;
    const index = parent.children.indexOf(model);
    if (index < 0) return;
    // before:
    // aaa|
    //
    // after:
    // aaa
    // |
    id = store.addBlock('affine:paragraph', {}, parent, index + 1);
  }

  focusTextModel(std, id);
  return next({ paragraphConvertedId: id });
};
