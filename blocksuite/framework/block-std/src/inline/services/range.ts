import type { BaseTextAttributes } from '@blocksuite/store';
import { effect } from '@preact/signals-core';
import * as Y from 'yjs';

import type { VLine } from '../components/v-line.js';
import type { InlineEditor } from '../inline-editor.js';
import type { InlineRange, TextPoint } from '../types.js';
import { isInEmbedGap } from '../utils/embed.js';
import { isMaybeInlineRangeEqual } from '../utils/inline-range.js';
import {
  domRangeToInlineRange,
  inlineRangeToDomRange,
} from '../utils/range-conversion.js';
import { calculateTextLength, getTextNodesFromElement } from '../utils/text.js';

export class RangeService<TextAttributes extends BaseTextAttributes> {
  private _lastEndRelativePosition: Y.RelativePosition | null = null;

  private _lastStartRelativePosition: Y.RelativePosition | null = null;

  focusEnd = (): void => {
    this.editor.setInlineRange({
      index: this.editor.yTextLength,
      length: 0,
    });
  };

  focusIndex = (index: number): void => {
    this.editor.setInlineRange({
      index,
      length: 0,
    });
  };

  focusStart = (): void => {
    this.editor.setInlineRange({
      index: 0,
      length: 0,
    });
  };

  getInlineRangeFromElement = (element: Element): InlineRange | null => {
    const range = document.createRange();
    const text = element.querySelector('[data-v-text]');
    if (!text) {
      return null;
    }
    const textNode = text.childNodes[1];
    if (!(textNode instanceof Text)) {
      return null;
    }
    range.setStart(textNode, 0);
    range.setEnd(textNode, textNode.textContent?.length ?? 0);
    const inlineRange = this.toInlineRange(range);
    return inlineRange;
  };

  // the number is related to the VLine's textLength
  getLine = (
    rangeIndex: InlineRange['index']
  ): {
    line: VLine;
    lineIndex: number;
    rangeIndexRelatedToLine: number;
  } | null => {
    const rootElement = this.editor.rootElement;
    if (!rootElement) return null;

    const lineElements = Array.from(rootElement.querySelectorAll('v-line'));

    let beforeIndex = 0;
    for (const [lineIndex, lineElement] of lineElements.entries()) {
      if (
        rangeIndex >= beforeIndex &&
        rangeIndex < beforeIndex + lineElement.vTextLength + 1
      ) {
        return {
          line: lineElement,
          lineIndex,
          rangeIndexRelatedToLine: rangeIndex - beforeIndex,
        };
      }
      beforeIndex += lineElement.vTextLength + 1;
    }

    console.error('failed to find line');
    return null;
  };

  getNativeRange = (): Range | null => {
    const selection = this.getNativeSelection();
    if (!selection) return null;
    return selection.getRangeAt(0);
  };

  getNativeSelection = (): Selection | null => {
    const selection = document.getSelection();
    if (!selection) return null;
    if (selection.rangeCount === 0) return null;

    return selection;
  };

  getTextPoint = (rangeIndex: InlineRange['index']): TextPoint | null => {
    const rootElement = this.editor.rootElement;
    if (!rootElement) return null;

    const vLines = Array.from(rootElement.querySelectorAll('v-line'));

    let index = 0;
    for (const vLine of vLines) {
      const texts = getTextNodesFromElement(vLine);
      if (texts.length === 0) {
        return null;
      }

      for (const text of texts.filter(text => !isInEmbedGap(text))) {
        if (!text.textContent) {
          return null;
        }
        if (index + text.textContent.length >= rangeIndex) {
          return [text, rangeIndex - index];
        }
        index += calculateTextLength(text);
      }

      index += 1;
    }

    return null;
  };

  /**
   * There are two cases to have the second line:
   * 1. long text auto wrap in span element
   * 2. soft break
   */
  isFirstLine = (inlineRange: InlineRange | null): boolean => {
    if (!inlineRange || inlineRange.length > 0) return false;

    const range = this.toDomRange(inlineRange);
    if (!range) {
      console.error('failed to convert inline range to domRange');
      return false;
    }

    // check case 1:
    const beforeText = this.editor.yTextString.slice(0, inlineRange.index);
    if (beforeText.includes('\n')) {
      return false;
    }

    // check case 2:
    // If there is a wrapped text, there are two possible positions for
    // cursor: (in first line and in second line)
    // aaaaaaaa| or aaaaaaaa
    // bb           |bb
    // We have no way to distinguish them and we just assume that the cursor
    // can not in the first line because if we apply the inline ranage manually the
    // cursor will jump to the second line.
    const container = range.commonAncestorContainer.parentElement;
    if (!container) {
      console.error('failed to get container');
      return false;
    }
    const containerRect = container.getBoundingClientRect();
    // There will be two rects if the cursor is at the edge of the line:
    // aaaaaaaa| or aaaaaaaa
    // bb           |bb
    const rangeRects = range.getClientRects();
    // We use last rect here to make sure we get the second rect.
    // (Based on the assumption that the cursor can not in the first line)
    const rangeRect = rangeRects[rangeRects.length - 1];
    const tolerance = 1;
    return Math.abs(rangeRect.top - containerRect.top) < tolerance;
  };

  /**
   * There are two cases to have the second line:
   * 1. long text auto wrap in span element
   * 2. soft break
   */
  isLastLine = (inlineRange: InlineRange | null): boolean => {
    if (!inlineRange || inlineRange.length > 0) return false;

    // check case 1:
    const afterText = this.editor.yTextString.slice(inlineRange.index);
    if (afterText.includes('\n')) {
      return false;
    }

    const range = this.toDomRange(inlineRange);
    if (!range) {
      console.error('failed to convert inline range to domRange');
      return false;
    }

    // check case 2:
    // If there is a wrapped text, there are two possible positions for
    // cursor: (in first line and in second line)
    // aaaaaaaa| or aaaaaaaa
    // bb           |bb
    // We have no way to distinguish them and we just assume that the cursor
    // can not in the first line because if we apply the inline range manually the
    // cursor will jump to the second line.
    const container = range.commonAncestorContainer.parentElement;
    if (!container) {
      console.error('failed to get container');
      return false;
    }
    const containerRect = container.getBoundingClientRect();
    // There will be two rects if the cursor is at the edge of the line:
    // aaaaaaaa| or aaaaaaaa
    // bb           |bb
    const rangeRects = range.getClientRects();
    // We use last rect here to make sure we get the second rect.
    // (Based on the assumption that the cursor can not be in the first line)
    const rangeRect = rangeRects[rangeRects.length - 1];

    const tolerance = 1;
    return Math.abs(rangeRect.bottom - containerRect.bottom) < tolerance;
  };

  isValidInlineRange = (inlineRange: InlineRange | null): boolean => {
    return !(
      inlineRange &&
      (inlineRange.index < 0 ||
        inlineRange.index + inlineRange.length > this.editor.yText.length)
    );
  };

  mount = () => {
    const editor = this.editor;
    let lastInlineRange: InlineRange | null = editor.inlineRange$.value;
    editor.disposables.add(
      effect(() => {
        const newInlineRange = editor.inlineRange$.value;
        if (!editor.mounted) return;

        const eq = isMaybeInlineRangeEqual(lastInlineRange, newInlineRange);
        if (eq) return;
        lastInlineRange = newInlineRange;

        const yText = editor.yText;
        if (newInlineRange) {
          this._lastStartRelativePosition =
            Y.createRelativePositionFromTypeIndex(yText, newInlineRange.index);
          this._lastEndRelativePosition = Y.createRelativePositionFromTypeIndex(
            yText,
            newInlineRange.index + newInlineRange.length
          );
        } else {
          this._lastStartRelativePosition = null;
          this._lastEndRelativePosition = null;
        }

        if (editor.inlineRangeProviderOverride) return;

        if (this.editor.renderService.rendering) {
          const subscription = editor.slots.renderComplete.subscribe(() => {
            subscription.unsubscribe();
            this.syncInlineRange(newInlineRange);
          });
        } else {
          this.syncInlineRange();
        }
      })
    );
  };

  selectAll = (): void => {
    this.editor.setInlineRange({
      index: 0,
      length: this.editor.yTextLength,
    });
  };

  private _syncInlineRangeLock = false;
  lockSyncInlineRange = () => {
    this._syncInlineRangeLock = true;
  };
  unlockSyncInlineRange = () => {
    this._syncInlineRangeLock = false;
  };
  /**
   * sync the dom selection from inline range for **this Editor**
   */
  syncInlineRange = (inlineRange?: InlineRange | null) => {
    if (!this.editor.mounted || this._syncInlineRangeLock) return;
    inlineRange = inlineRange ?? this.editor.getInlineRange();

    const handler = () => {
      const selection = document.getSelection();
      if (!selection) return;
      if (!this.editor.rootElement) return;

      if (inlineRange === null) {
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          if (range.intersectsNode(this.editor.rootElement)) {
            selection.removeAllRanges();
          }
        }
      } else {
        try {
          const newRange = this.toDomRange(inlineRange);
          if (newRange) {
            selection.removeAllRanges();
            selection.addRange(newRange);
            this.editor.rootElement.focus();

            this.editor.slots.inlineRangeSync.next(newRange);
          } else {
            const subscription = this.editor.slots.renderComplete.subscribe(
              () => {
                subscription.unsubscribe();
                this.syncInlineRange(inlineRange);
              }
            );
          }
        } catch (error) {
          console.error('failed to apply inline range');
          console.error(error);
        }
      }
    };

    if (this.editor.renderService.rendering) {
      const subscription = this.editor.slots.renderComplete.subscribe(() => {
        subscription.unsubscribe();
        handler();
      });
    } else {
      handler();
    }
  };

  /**
   * calculate the dom selection from inline ranage for **this Editor**
   */
  toDomRange = (inlineRange: InlineRange): Range | null => {
    const rootElement = this.editor.rootElement;
    if (!rootElement) return null;
    return inlineRangeToDomRange(rootElement, inlineRange);
  };

  /**
   * calculate the inline ranage from dom selection for **this Editor**
   * there are three cases when the inline ranage of this Editor is not null:
   * (In the following, "|" mean anchor and focus, each line is a separate Editor)
   * 1. anchor and focus are in this Editor
   *    ```
   *    aaaaaa
   *    b|bbbb|b
   *    cccccc
   *    ```
   *    the inline ranage of second Editor is `{index: 1, length: 4}`, the others are null
   * 2. anchor and focus one in this Editor, one in another Editor
   *    ```
   *    aaa|aaa    aaaaaa
   *    bbbbb|b or bbbbb|b
   *    cccccc     cc|cccc
   *    ```
   *    2.1
   *        the inline ranage of first Editor is `{index: 3, length: 3}`, the second is `{index: 0, length: 5}`,
   *        the third is null
   *    2.2
   *        the inline ranage of first Editor is null, the second is `{index: 5, length: 1}`,
   *        the third is `{index: 0, length: 2}`
   * 3. anchor and focus are in another Editor
   *    ```
   *    aa|aaaa
   *    bbbbbb
   *    cccc|cc
   *    ```
   *    the inline range of first Editor is `{index: 2, length: 4}`,
   *    the second is `{index: 0, length: 6}`, the third is `{index: 0, length: 4}`
   */
  toInlineRange = (range: Range): InlineRange | null => {
    const { rootElement, yText } = this.editor;
    if (!rootElement || !yText) return null;
    return domRangeToInlineRange(range, rootElement, yText);
  };

  get lastEndRelativePosition() {
    return this._lastEndRelativePosition;
  }

  get lastStartRelativePosition() {
    return this._lastStartRelativePosition;
  }

  constructor(readonly editor: InlineEditor<TextAttributes>) {}
}
