import { textKeymap } from '@blocksuite/affine-inline-preset';
import { ListBlockSchema } from '@blocksuite/affine-model';
import { getSelectedModelsCommand } from '@blocksuite/affine-shared/commands';
import { IS_MAC } from '@blocksuite/global/env';
import { KeymapExtension, TextSelection } from '@blocksuite/std';

import {
  canDedentListCommand,
  dedentListCommand,
} from './commands/dedent-list.js';
import {
  canIndentListCommand,
  indentListCommand,
} from './commands/indent-list.js';
import { listToParagraphCommand } from './commands/list-to-paragraph.js';
import { splitListCommand } from './commands/split-list.js';
import { forwardDelete } from './utils/forward-delete.js';

export const ListKeymapExtension = KeymapExtension(
  std => {
    return {
      Enter: ctx => {
        const text = std.selection.find(TextSelection);
        if (!text) return false;

        ctx.get('keyboardState').raw.preventDefault();
        std.command
          .chain()
          .pipe(splitListCommand, {
            blockId: text.from.blockId,
            inlineIndex: text.from.index,
          })
          .run();
        return true;
      },
      'Mod-Enter': ctx => {
        const text = std.selection.find(TextSelection);
        if (!text) return false;

        ctx.get('keyboardState').raw.preventDefault();
        std.command
          .chain()
          .pipe(splitListCommand, {
            blockId: text.from.blockId,
            inlineIndex: text.from.index,
          })
          .run();
        return true;
      },
      Tab: ctx => {
        const [_, { selectedModels }] = std.command
          .chain()
          .pipe(getSelectedModelsCommand, {
            types: ['text'],
          })
          .run();
        if (selectedModels?.length !== 1) {
          return false;
        }
        const text = std.selection.find(TextSelection);
        if (!text) return false;

        ctx.get('keyboardState').raw.preventDefault();
        std.command
          .chain()
          .pipe(canIndentListCommand, {
            blockId: text.from.blockId,
            inlineIndex: text.from.index,
          })
          .pipe(indentListCommand)
          .run();
        return true;
      },
      'Shift-Tab': ctx => {
        const [_, { selectedModels }] = std.command
          .chain()
          .pipe(getSelectedModelsCommand, {
            types: ['text'],
          })
          .run();
        if (selectedModels?.length !== 1) {
          return;
        }
        const text = std.selection.find(TextSelection);
        if (!text) return false;

        ctx.get('keyboardState').raw.preventDefault();
        std.command
          .chain()
          .pipe(canDedentListCommand, {
            blockId: text.from.blockId,
            inlineIndex: text.from.index,
          })
          .pipe(dedentListCommand)
          .run();
        return true;
      },
      Backspace: ctx => {
        const text = std.selection.find(TextSelection);
        if (!text) return false;
        const isCollapsed = text.isCollapsed();
        const isStart = isCollapsed && text.from.index === 0;
        if (!isStart) return false;

        ctx.get('defaultState').event.preventDefault();
        std.command
          .chain()
          .pipe(listToParagraphCommand, {
            id: text.from.blockId,
          })
          .run();
        return true;
      },
      'Control-d': ctx => {
        if (!IS_MAC) return;
        const deleted = forwardDelete(std);
        if (!deleted) return;
        ctx.get('keyboardState').raw.preventDefault();
        return true;
      },
      Delete: ctx => {
        const deleted = forwardDelete(std);
        if (!deleted) return;
        ctx.get('keyboardState').raw.preventDefault();
        return true;
      },
    };
  },
  {
    flavour: ListBlockSchema.model.flavour,
  }
);

export const ListTextKeymapExtension = KeymapExtension(textKeymap, {
  flavour: ListBlockSchema.model.flavour,
});
