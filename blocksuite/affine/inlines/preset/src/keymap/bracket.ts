import { insertLinkedNode } from '@blocksuite/affine-inline-reference';
import { CodeBlockModel } from '@blocksuite/affine-model';
import { getInlineEditorByModel } from '@blocksuite/affine-rich-text';
import { BRACKET_PAIRS } from '@blocksuite/affine-shared/consts';
import { createDefaultDoc, matchModels } from '@blocksuite/affine-shared/utils';
import {
  type BlockStdScope,
  TextSelection,
  type UIEventHandler,
} from '@blocksuite/std';
import type { InlineEditor } from '@blocksuite/std/inline';

export const bracketKeymap = (
  std: BlockStdScope
): Record<string, UIEventHandler> => {
  const keymap = BRACKET_PAIRS.reduce(
    (acc, pair) => {
      return {
        ...acc,
        [pair.right]: ctx => {
          const { store: doc, selection } = std;
          if (doc.readonly) return;

          const textSelection = selection.find(TextSelection);
          if (!textSelection) return;
          const model = doc.getBlock(textSelection.from.blockId)?.model;
          if (!model) return;
          if (!matchModels(model, [CodeBlockModel])) return;
          const inlineEditor = getInlineEditorByModel(
            std,
            textSelection.from.blockId
          );
          if (!inlineEditor) return;
          const inlineRange = inlineEditor.getInlineRange();
          if (!inlineRange) return;
          const left = inlineEditor.yText.toString()[inlineRange.index - 1];
          const right = inlineEditor.yText.toString()[inlineRange.index];
          if (pair.left === left && pair.right === right) {
            inlineEditor.setInlineRange({
              index: inlineRange.index + 1,
              length: 0,
            });
            ctx.get('keyboardState').raw.preventDefault();
          }
        },
        [pair.left]: ctx => {
          const { store: doc, selection } = std;
          if (doc.readonly) return;

          const textSelection = selection.find(TextSelection);
          if (!textSelection) return;
          const model = doc.getBlock(textSelection.from.blockId)?.model;
          if (!model) return;

          const isCodeBlock = matchModels(model, [CodeBlockModel]);
          // When selection is collapsed, only trigger auto complete in code block
          if (textSelection.isCollapsed() && !isCodeBlock) return;
          if (!textSelection.isInSameBlock()) return;

          ctx.get('keyboardState').raw.preventDefault();

          const inlineEditor = getInlineEditorByModel(
            std,
            textSelection.from.blockId
          );
          if (!inlineEditor) return;
          const inlineRange = inlineEditor.getInlineRange();
          if (!inlineRange) return;
          const selectedText = inlineEditor.yText
            .toString()
            .slice(inlineRange.index, inlineRange.index + inlineRange.length);
          if (!isCodeBlock && pair.name === 'square bracket') {
            // [[Selected text]] should automatically be converted to a Linked doc with the title "Selected text".
            // See https://github.com/toeverything/blocksuite/issues/2730
            const success = tryConvertToLinkedDoc(std, inlineEditor);
            if (success) return true;
          }
          inlineEditor.insertText(
            inlineRange,
            pair.left + selectedText + pair.right
          );

          inlineEditor.setInlineRange({
            index: inlineRange.index + 1,
            length: inlineRange.length,
          });

          return true;
        },
      };
    },
    {} as Record<string, UIEventHandler>
  );

  return {
    ...keymap,
    '`': ctx => {
      const { store: doc, selection } = std;
      if (doc.readonly) return;

      const textSelection = selection.find(TextSelection);
      if (!textSelection || textSelection.isCollapsed()) return;
      if (!textSelection.isInSameBlock()) return;
      const model = doc.getBlock(textSelection.from.blockId)?.model;
      if (!model) return;

      ctx.get('keyboardState').raw.preventDefault();
      const inlineEditor = getInlineEditorByModel(
        std,
        textSelection.from.blockId
      );
      if (!inlineEditor) return;
      const inlineRange = inlineEditor.getInlineRange();
      if (!inlineRange) return;
      inlineEditor.formatText(inlineRange, { code: true });

      inlineEditor.setInlineRange({
        index: inlineRange.index,
        length: inlineRange.length,
      });

      return true;
    },
  };
};

function tryConvertToLinkedDoc(std: BlockStdScope, inlineEditor: InlineEditor) {
  const root = std.store.root;
  if (!root) return false;
  const linkedDocWidgetEle = std.view.getWidget(
    'affine-linked-doc-widget',
    root.id
  );
  if (!linkedDocWidgetEle) return false;

  const inlineRange = inlineEditor.getInlineRange();
  if (!inlineRange) return false;
  const text = inlineEditor.yText.toString();
  const left = text[inlineRange.index - 1];
  const right = text[inlineRange.index + inlineRange.length];
  const needConvert = left === '[' && right === ']';
  if (!needConvert) return false;

  const docName = text.slice(
    inlineRange.index,
    inlineRange.index + inlineRange.length
  );
  inlineEditor.deleteText({
    index: inlineRange.index - 1,
    length: inlineRange.length + 2,
  });
  inlineEditor.setInlineRange({ index: inlineRange.index - 1, length: 0 });

  const doc = createDefaultDoc(std.store.workspace, {
    title: docName,
  });
  insertLinkedNode({
    inlineEditor,
    docId: doc.id,
  });
  return true;
}
