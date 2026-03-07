import { insertLinkedNode } from '@blocksuite/affine-inline-reference';
import { CodeBlockModel } from '@blocksuite/affine-model';
import { getInlineEditorByModel } from '@blocksuite/affine-rich-text';
import {
  BRACKET_PAIRS,
  REFERENCE_NODE,
} from '@blocksuite/affine-shared/consts';
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
    // Wikilink input rule: fires on the second ] typed.
    // Detects [[title]], [[title|alias]], [[title#heading]], [[title#^block-id]]
    // and converts the text span to an unresolved reference inline delta.
    // Per contracts/inline-extensions.md §3.
    ']': ctx => {
      const { store: doc, selection } = std;
      if (doc.readonly) return;

      const textSelection = selection.find(TextSelection);
      if (!textSelection || !textSelection.isCollapsed()) return;
      const model = doc.getBlock(textSelection.from.blockId)?.model;
      if (!model) return;
      // Wikilinks do not apply inside code blocks.
      if (matchModels(model, [CodeBlockModel])) return;

      const inlineEditor = getInlineEditorByModel(
        std,
        textSelection.from.blockId
      );
      if (!inlineEditor) return;
      const inlineRange = inlineEditor.getInlineRange();
      if (!inlineRange) return;

      // Check if the typed character closes a [[...]] wikilink.
      // The text before cursor ends with [[...]] — we need to detect this AFTER
      // the second ] has been inserted by the default handler, so we look at the
      // text up to the cursor position.
      const text = inlineEditor.yText.toString();
      const cursorIndex = inlineRange.index;

      // Scan backward from cursor-1 to find [[..]] pattern.
      // The cursor is AT the position after the last ].
      // Look for [[ ... ]] ending at cursorIndex.
      const textBefore = text.slice(0, cursorIndex);

      // Match [[...]] where ... is the raw wikilink content
      // Supports: [[title]], [[title|alias]], [[title#anchor]], [[title#^block-id]]
      const wikilinkMatch = textBefore.match(/\[\[([^[\]]+)\]\]$/);
      if (!wikilinkMatch) return;

      const rawContent = wikilinkMatch[1];
      const matchStart = cursorIndex - wikilinkMatch[0].length;

      // Parse the raw content into components.
      const result = parseWikilinkContent(rawContent);
      if (!result) return;

      ctx.get('keyboardState').raw.preventDefault();

      // Delete the [[...]] span from the text.
      inlineEditor.deleteText({
        index: matchStart,
        length: wikilinkMatch[0].length,
      });

      // Build reference params for anchor/block links (per ReferenceParamsSchema).
      const refParams: { blockIds?: string[] } = {};
      if (result.anchor?.startsWith('^')) {
        // Block reference: [[title#^block-id]]
        refParams.blockIds = [result.anchor.slice(1)];
        // Note: heading anchors are stored in the title field for follow-up resolution.
      }

      const hasParams = Object.keys(refParams).length > 0;

      // Insert unresolved reference delta.
      // pageId = '' means unresolved; WikilinkResolver will update it asynchronously.
      // title (AliasInfo.title) stores the wikilink target for resolution lookup.
      inlineEditor.insertText(
        { index: matchStart, length: 0 },
        REFERENCE_NODE,
        {
          reference: {
            type: 'LinkedPage',
            pageId: '',
            title: result.targetTitle,
            params: hasParams ? refParams : undefined,
          },
        }
      );
      inlineEditor.setInlineRange({ index: matchStart + 1, length: 0 });
      return true;
    },
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

/**
 * Parses raw wikilink content (between [[ and ]]) into components.
 *
 * Supported forms (per contracts/inline-extensions.md §3):
 * - [[Page Name]]           → { targetTitle: 'Page Name', displayText: 'Page Name' }
 * - [[Page Name|Alias]]     → { targetTitle: 'Page Name', displayText: 'Alias' }
 * - [[Page Name#Heading]]   → { targetTitle: 'Page Name', anchor: 'Heading' }
 * - [[Page Name#^block-id]] → { targetTitle: 'Page Name', anchor: '^block-id' }
 */
function parseWikilinkContent(rawContent: string): {
  targetTitle: string;
  displayText: string;
  anchor?: string;
} | null {
  if (!rawContent.trim()) return null;

  // Split on | for alias: [[title|display]]
  const pipeIdx = rawContent.indexOf('|');
  let titlePart: string;
  let displayText: string;

  if (pipeIdx !== -1) {
    titlePart = rawContent.slice(0, pipeIdx);
    displayText = rawContent.slice(pipeIdx + 1);
  } else {
    titlePart = rawContent;
    displayText = rawContent;
  }

  // Split on # for anchor: [[title#heading]] or [[title#^block-id]]
  const hashIdx = titlePart.indexOf('#');
  let targetTitle: string;
  let anchor: string | undefined;

  if (hashIdx !== -1) {
    targetTitle = titlePart.slice(0, hashIdx);
    anchor = titlePart.slice(hashIdx + 1);
    // Update display text if it was the full raw content (no alias given)
    if (pipeIdx === -1) {
      displayText = targetTitle;
    }
  } else {
    targetTitle = titlePart;
  }

  if (!targetTitle.trim()) return null;

  return {
    targetTitle: targetTitle.trim(),
    displayText: displayText.trim(),
    anchor,
  };
}

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
