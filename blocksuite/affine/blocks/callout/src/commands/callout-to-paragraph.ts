import {
  CalloutBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import { matchModels } from '@blocksuite/affine-shared/utils';
import type { Command } from '@blocksuite/std';
import { BlockSelection } from '@blocksuite/std';
import { Text } from '@blocksuite/store';

export const calloutToParagraphCommand: Command<
  {
    id: string;
    stopCapturing?: boolean;
  },
  {
    success: boolean;
  }
> = (ctx, next) => {
  const { id, stopCapturing = true } = ctx;
  const std = ctx.std;
  const doc = std.store;
  const model = doc.getBlock(id)?.model;

  if (!model || !matchModels(model, [ParagraphBlockModel])) return false;

  const parent = doc.getParent(model);
  if (!parent || !matchModels(parent, [CalloutBlockModel])) return false;

  if (stopCapturing) std.store.captureSync();

  // Get current block index in callout
  const currentIndex = parent.children.indexOf(model);
  const hasText = model.text && model.text.length > 0;

  // Find previous paragraph block in callout
  let previousBlock = null;
  for (let i = currentIndex - 1; i >= 0; i--) {
    const sibling = parent.children[i];
    if (matchModels(sibling, [ParagraphBlockModel])) {
      previousBlock = sibling;
      break;
    }
  }

  if (previousBlock && hasText) {
    // Clone current text content before any operations to prevent data loss
    const currentText = model.text || new Text();

    // Get previous block text and merge index
    const previousText = previousBlock.text || new Text();
    const mergeIndex = previousText.length;

    // Apply each delta from cloned current text to previous block to preserve formatting
    previousText.join(currentText);

    // Remove current block after text has been merged
    doc.deleteBlock(model, {
      deleteChildren: false,
    });

    // Focus at merge point in previous block
    focusTextModel(std, previousBlock.id, mergeIndex);
  } else if (previousBlock && !hasText) {
    // Move cursor to end of previous block
    doc.deleteBlock(model, {
      deleteChildren: false,
    });

    const previousText = previousBlock.text || new Text();
    focusTextModel(std, previousBlock.id, previousText.length);
  } else {
    // No previous block, select the entire callout
    doc.deleteBlock(model, {
      deleteChildren: false,
    });

    std.selection.setGroup('note', [
      std.selection.create(BlockSelection, {
        blockId: parent.id,
      }),
    ]);
  }

  return next({ success: true });
};
