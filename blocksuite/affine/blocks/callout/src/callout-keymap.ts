import {
  CalloutBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import { matchModels } from '@blocksuite/affine-shared/utils';
import {
  BlockSelection,
  KeymapExtension,
  TextSelection,
} from '@blocksuite/std';

import { calloutToParagraphCommand } from './commands/callout-to-paragraph.js';
import { splitCalloutCommand } from './commands/split-callout.js';

export const CalloutKeymapExtension = KeymapExtension(std => {
  return {
    Enter: ctx => {
      const text = std.selection.find(TextSelection);
      if (!text) return false;

      const currentBlock = std.store.getBlock(text.from.blockId);
      if (!currentBlock) return false;

      // Check if current block is a callout block
      let calloutBlock = currentBlock;
      if (!matchModels(currentBlock.model, [CalloutBlockModel])) {
        // If not, check if the parent is a callout block
        const parent = std.store.getParent(currentBlock.model);
        if (!parent || !matchModels(parent, [CalloutBlockModel])) {
          return false;
        }
        const parentBlock = std.store.getBlock(parent.id);
        if (!parentBlock) return false;
        calloutBlock = parentBlock;
      }

      ctx.get('keyboardState').raw.preventDefault();
      std.command
        .chain()
        .pipe(splitCalloutCommand, {
          blockId: calloutBlock.model.id,
          inlineIndex: text.from.index,
          currentBlockId: text.from.blockId,
        })
        .run();
      return true;
    },
    Backspace: ctx => {
      const text = std.selection.find(TextSelection);
      if (text && text.isCollapsed() && text.from.index === 0) {
        const event = ctx.get('defaultState').event;

        const block = std.store.getBlock(text.from.blockId);
        if (!block) return false;
        const parent = std.store.getParent(block.model);
        if (!parent) return false;
        if (!matchModels(parent, [CalloutBlockModel])) return false;

        // Check if current block is a paragraph inside callout
        if (matchModels(block.model, [ParagraphBlockModel])) {
          event.preventDefault();

          std.command
            .chain()
            .pipe(calloutToParagraphCommand, {
              id: block.model.id,
            })
            .run();

          return true;
        }

        // Fallback to selecting the callout block
        event.preventDefault();
        std.selection.setGroup('note', [
          std.selection.create(BlockSelection, {
            blockId: parent.id,
          }),
        ]);

        return true;
      }
      return false;
    },
  };
});
