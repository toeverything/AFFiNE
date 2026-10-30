import type { InlineRootElement } from '@blocksuite/std/inline';

function getInlineRoot(target: HTMLElement): InlineRootElement | null {
  const inlineRoot = target.closest('[data-v-root="true"]');
  if (!inlineRoot) {
    return null;
  }
  return inlineRoot as InlineRootElement;
}

export function insertTextFromPencilScribble(
  target: HTMLElement,
  text: string
): boolean {
  if (!text) {
    return false;
  }

  const inlineEditor = getInlineRoot(target)?.inlineEditor;
  if (!inlineEditor || inlineEditor.isComposing || inlineEditor.isReadonly) {
    return false;
  }

  const inlineRange = inlineEditor.getInlineRange() ?? {
    index: inlineEditor.yTextLength,
    length: 0,
  };
  if (!inlineEditor.isValidInlineRange(inlineRange)) {
    return false;
  }

  inlineEditor.insertText(inlineRange, text);
  inlineEditor.setInlineRange({
    index: inlineRange.index + text.length,
    length: 0,
  });
  return true;
}
