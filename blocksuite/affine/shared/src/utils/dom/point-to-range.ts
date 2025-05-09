import { IS_FIREFOX } from '@blocksuite/global/env';

declare global {
  interface Document {
    // firefox API
    caretPositionFromPoint(
      x: number,
      y: number
    ): {
      offsetNode: Node;
      offset: number;
    } | null;
  }
}

/**
 * A wrapper for the browser's `caretPositionFromPoint` and `caretRangeFromPoint`,
 * but adapted for different browsers.
 */
export function caretRangeFromPoint(
  clientX: number,
  clientY: number
): Range | null {
  if (IS_FIREFOX) {
    const caret = document.caretPositionFromPoint(clientX, clientY);
    if (!caret) {
      return null;
    }
    // TODO handle caret is covered by popup
    const range = document.createRange();
    let offset = caret.offset;
    if (caret.offsetNode.nodeType === Node.TEXT_NODE) {
      const textNode = caret.offsetNode as Text;
      offset = Math.max(0, Math.min(offset, textNode.length));
    } else if (caret.offsetNode.nodeType === Node.ELEMENT_NODE) {
      const elementNode = caret.offsetNode as Element;
      offset = Math.max(0, Math.min(offset, elementNode.childNodes.length));
    }

    range.setStart(caret.offsetNode, offset);
    return range;
  }

  const range = document.caretRangeFromPoint(clientX, clientY);

  if (!range) {
    return null;
  }

  // See https://github.com/toeverything/blocksuite/issues/1382
  const rangeRects = range?.getClientRects();
  if (
    rangeRects &&
    rangeRects.length === 2 &&
    range.startOffset === range.endOffset &&
    clientY < rangeRects[0].y + rangeRects[0].height
  ) {
    const deltaX = (rangeRects[0].x | 0) - (rangeRects[1].x | 0);

    if (deltaX > 0) {
      range.setStart(range.startContainer, range.startOffset - 1);
      range.setEnd(range.endContainer, range.endOffset - 1);
    }
  }
  return range;
}

export function resetNativeSelection(range: Range | null) {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  range && selection.addRange(range);
}

export function getCurrentNativeRange(selection = window.getSelection()) {
  // When called on an <iframe> that is not displayed (e.g., where display: none is set) Firefox will return null
  // See https://developer.mozilla.org/en-US/docs/Web/API/Window/getSelection for more details
  if (!selection) {
    console.error('Failed to get current range, selection is null');
    return null;
  }
  if (selection.rangeCount === 0) {
    return null;
  }
  if (selection.rangeCount > 1) {
    console.warn('getCurrentNativeRange may be wrong, rangeCount > 1');
  }
  return selection.getRangeAt(0);
}

export function handleNativeRangeAtPoint(x: number, y: number) {
  const range = caretRangeFromPoint(x, y);
  const startContainer = range?.startContainer;
  // click on rich text
  if (startContainer instanceof Node) {
    resetNativeSelection(range);
  }
}
