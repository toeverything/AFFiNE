import { textKeymap } from '@blocksuite/affine-inline-preset';
import {
  CalloutBlockModel,
  ParagraphBlockModel,
  ParagraphBlockSchema,
} from '@blocksuite/affine-model';
import {
  focusTextModel,
  getInlineEditorByModel,
} from '@blocksuite/affine-rich-text';
import {
  calculateCollapsedSiblings,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import { IS_MAC } from '@blocksuite/global/env';
import { KeymapExtension, TextSelection } from '@blocksuite/std';

import { addParagraphCommand } from './commands/add-paragraph.js';
import {
  canDedentParagraphCommand,
  dedentParagraphCommand,
} from './commands/dedent-paragraph.js';
import {
  canIndentParagraphCommand,
  indentParagraphCommand,
} from './commands/indent-paragraph.js';
import { splitParagraphCommand } from './commands/split-paragraph.js';
import { forwardDelete } from './utils/forward-delete.js';
import { mergeWithPrev } from './utils/merge-with-prev.js';

export const ParagraphKeymapExtension = KeymapExtension(
  std => {
    return {
      Backspace: ctx => {
        const text = std.selection.find(TextSelection);
        if (!text) return;
        const isCollapsed = text.isCollapsed();
        const isStart = isCollapsed && text.from.index === 0;
        if (!isStart) return;

        const { store } = std;
        const model = store.getBlock(text.from.blockId)?.model;
        if (
          !model ||
          !matchModels(model, [ParagraphBlockModel]) ||
          matchModels(model.parent, [CalloutBlockModel])
        )
          return;

        const event = ctx.get('defaultState').event;
        event.preventDefault();

        // When deleting at line start of a paragraph block,
        // firstly switch it to normal text, then delete this empty block.
        if (model.props.type !== 'text') {
          // Try to switch to normal text
          store.captureSync();
          store.updateBlock(model, { type: 'text' });
          return true;
        }

        const merged = mergeWithPrev(std.host, model);
        if (merged) {
          return true;
        }

        std.command
          .chain()
          .pipe(canDedentParagraphCommand)
          .pipe(dedentParagraphCommand)
          .run();
        return true;
      },
      'Mod-Enter': ctx => {
        const { store } = std;
        const text = std.selection.find(TextSelection);
        if (!text) return;
        const model = store.getBlock(text.from.blockId)?.model;
        if (
          !model ||
          !matchModels(model, [ParagraphBlockModel]) ||
          matchModels(model.parent, [CalloutBlockModel])
        )
          return;
        const inlineEditor = getInlineEditorByModel(std, text.from.blockId);
        const inlineRange = inlineEditor?.getInlineRange();
        if (!inlineRange || !inlineEditor) return;
        const raw = ctx.get('keyboardState').raw;
        raw.preventDefault();
        if (model.props.type === 'quote') {
          store.captureSync();
          inlineEditor.insertText(inlineRange, '\n');
          inlineEditor.setInlineRange({
            index: inlineRange.index + 1,
            length: 0,
          });
          return true;
        }

        std.command.chain().pipe(addParagraphCommand).run();
        return true;
      },
      Enter: ctx => {
        const { store } = std;
        const text = std.selection.find(TextSelection);
        if (!text) return;
        const model = store.getBlock(text.from.blockId)?.model;
        if (
          !model ||
          !matchModels(model, [ParagraphBlockModel]) ||
          matchModels(model.parent, [CalloutBlockModel])
        )
          return;
        const inlineEditor = getInlineEditorByModel(std, text.from.blockId);
        const inlineRange = inlineEditor?.getInlineRange();
        if (!inlineRange || !inlineEditor) return;

        const raw = ctx.get('keyboardState').raw;
        const isEnd = model.props.text.length === inlineRange.index;

        if (model.props.type === 'quote') {
          const textStr = model.props.text.toString();

          /**
           * If quote block ends with two blank lines, split the block
           * ---
           * before:
           * > \n
           * > \n|
           *
           * after:
           * > \n
           * |
           * ---
           */
          const endWithTwoBlankLines =
            textStr === '\n' || textStr.endsWith('\n');
          if (isEnd && endWithTwoBlankLines) {
            raw.preventDefault();
            store.captureSync();
            model.props.text.delete(inlineRange.index - 1, 1);
            std.command.chain().pipe(addParagraphCommand).run();
            return true;
          }
          return true;
        }

        raw.preventDefault();

        if (model.props.type.startsWith('h') && model.props.collapsed) {
          const parent = store.getParent(model);
          if (!parent) return true;
          const index = parent.children.indexOf(model);
          if (index === -1) return true;
          const collapsedSiblings = calculateCollapsedSiblings(model);

          const rightText = model.props.text.split(inlineRange.index);
          const newId = store.addBlock(
            model.flavour,
            { type: model.props.type, text: rightText },
            parent,
            index + collapsedSiblings.length + 1
          );

          focusTextModel(std, newId);

          return true;
        }

        if (isEnd) {
          std.command.chain().pipe(addParagraphCommand).run();
          return true;
        }

        std.command.chain().pipe(splitParagraphCommand).run();
        return true;
      },
      Delete: ctx => {
        const deleted = forwardDelete(std);
        if (!deleted) {
          return;
        }
        const event = ctx.get('keyboardState').raw;
        event.preventDefault();
        return true;
      },
      'Control-d': ctx => {
        if (!IS_MAC) return;
        const deleted = forwardDelete(std);
        if (!deleted) {
          return;
        }
        const event = ctx.get('keyboardState').raw;
        event.preventDefault();
        return true;
      },
      Tab: ctx => {
        const [success] = std.command
          .chain()
          .pipe(canIndentParagraphCommand)
          .pipe(indentParagraphCommand)
          .run();
        if (!success) {
          return;
        }
        ctx.get('keyboardState').raw.preventDefault();
        return true;
      },
      'Shift-Tab': ctx => {
        const [success] = std.command
          .chain()
          .pipe(canDedentParagraphCommand)
          .pipe(dedentParagraphCommand)
          .run();
        if (!success) {
          return;
        }
        ctx.get('keyboardState').raw.preventDefault();
        return true;
      },
    };
  },
  {
    flavour: ParagraphBlockSchema.model.flavour,
  }
);

export const ParagraphTextKeymapExtension = KeymapExtension(textKeymap, {
  flavour: ParagraphBlockSchema.model.flavour,
});
