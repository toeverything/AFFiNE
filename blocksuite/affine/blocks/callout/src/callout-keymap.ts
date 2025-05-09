import { CalloutBlockModel } from '@blocksuite/affine-model';
import { matchModels } from '@blocksuite/affine-shared/utils';
import {
  BlockSelection,
  KeymapExtension,
  TextSelection,
} from '@blocksuite/std';

export const CalloutKeymapExtension = KeymapExtension(std => {
  return {
    Backspace: ctx => {
      const text = std.selection.find(TextSelection);
      if (text && text.isCollapsed() && text.from.index === 0) {
        const event = ctx.get('defaultState').event;
        event.preventDefault();

        const block = std.store.getBlock(text.from.blockId);
        if (!block) return false;
        const parent = std.store.getParent(block.model);
        if (!parent) return false;
        if (!matchModels(parent, [CalloutBlockModel])) return false;

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
