import type { BlockStdScope } from '@blocksuite/std';
import type { InlineEditor } from '@blocksuite/std/inline';
import type { BlockModel } from '@blocksuite/store';

import { focusTextModel } from '../dom.js';

export function getPrefixText(inlineEditor: InlineEditor) {
  const inlineRange = inlineEditor.getInlineRange();
  if (!inlineRange || inlineRange.length > 0) return '';

  const nearestLineBreakIndex = inlineEditor.yTextString
    .slice(0, inlineRange.index)
    .lastIndexOf('\n');
  const prefixText = inlineEditor.yTextString.slice(
    nearestLineBreakIndex + 1,
    inlineRange.index
  );
  return prefixText;
}

export function beforeConvert(
  std: BlockStdScope,
  model: BlockModel,
  index: number
) {
  const { text } = model;
  if (!text) return;
  // Add a space after the text, then stop capturing
  // So when the user undo, the prefix will be restored with a `space`
  // Ex. (| is the cursor position)
  // *| <- user input
  // <space> -> bullet list
  // *<space>| -> undo
  text.insert(' ', index);
  focusTextModel(std, model.id, index + 1);
  std.store.captureSync();
  text.delete(0, index + 1);
}
