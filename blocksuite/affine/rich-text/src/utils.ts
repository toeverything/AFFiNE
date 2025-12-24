import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import type { BlockStdScope } from '@blocksuite/std';
import type { InlineEditor } from '@blocksuite/std/inline';
import type { BlockModel } from '@blocksuite/store';
import { effect } from '@preact/signals-core';

import { getInlineEditorByModel } from './dom';

export function insertContent(
  std: BlockStdScope,
  model: BlockModel,
  text: string,
  attributes?: AffineTextAttributes
) {
  if (!model.text) {
    console.error("Can't insert text! Text not found");
    return;
  }
  const inlineEditor = getInlineEditorByModel(std, model);
  if (!inlineEditor) {
    console.error("Can't insert text! Inline editor not found");
    return;
  }
  const inlineRange = inlineEditor.getInlineRange();
  const index = inlineRange ? inlineRange.index : model.text.length;
  model.text.insert(text, index, attributes as Record<string, unknown>);
  // Update the caret to the end of the inserted text
  inlineEditor.setInlineRange({
    index: index + text.length,
    length: 0,
  });
}

// When the user selects a range, check if it matches the previous selection.
// If it does, apply the marks from the previous selection.
// If it does not, remove the marks from the previous selection.
export function clearMarksOnDiscontinuousInput(
  inlineEditor: InlineEditor
): void {
  let inlineRange = inlineEditor.getInlineRange();
  const dispose = effect(() => {
    const r = inlineEditor.inlineRange$.value;
    if (
      inlineRange &&
      r &&
      (inlineRange.index === r.index || inlineRange.index === r.index + 1)
    ) {
      inlineRange = r;
    } else {
      inlineEditor.resetMarks();
      dispose();
    }
  });
}

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
