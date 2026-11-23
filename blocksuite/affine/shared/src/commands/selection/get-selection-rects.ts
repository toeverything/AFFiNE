import type { BlockSelection, Command, TextSelection } from '@blocksuite/std';

import { getViewportElement } from '../../utils/index.js';

export interface SelectionRect {
  width: number;
  height: number;
  top: number;
  left: number;

  /**
   * The block id that the rect is in. Only available for block selections.
   */
  blockId?: string;
}

export const getSelectionRectsCommand: Command<
  {
    currentTextSelection?: TextSelection;
    currentBlockSelections?: BlockSelection[];
    textSelection?: TextSelection;
    blockSelections?: BlockSelection[];
  },
  {
    selectionRects: SelectionRect[];
  }
> = (ctx, next) => {
  let textSelection;
  let blockSelections;

  // priority parameters
  if (ctx.textSelection) {
    textSelection = ctx.textSelection;
  } else if (ctx.blockSelections) {
    blockSelections = ctx.blockSelections;
  } else if (ctx.currentTextSelection) {
    textSelection = ctx.currentTextSelection;
  } else if (ctx.currentBlockSelections) {
    blockSelections = ctx.currentBlockSelections;
  } else {
    console.error(
      'No selection provided, may forgot to call getTextSelection or getBlockSelections or provide the selection directly.'
    );
    return;
  }

  const { std } = ctx;

  const container = getViewportElement(std.host);
  const containerRect = container?.getBoundingClientRect();

  if (textSelection) {
    const range = std.range.textSelectionToRange(textSelection);

    if (range) {
      return next({
        selectionRects: getRangeRects(range, container),
      });
    }
  } else if (blockSelections && blockSelections.length > 0) {
    const result = blockSelections
      .map(blockSelection => {
        const block = std.view.getBlock(blockSelection.blockId);
        if (!block) return null;

        const rect = block.getBoundingClientRect();

        return {
          width: rect.width,
          height: rect.height,
          top:
            rect.top - (containerRect?.top ?? 0) + (container?.scrollTop ?? 0),
          left:
            rect.left -
            (containerRect?.left ?? 0) +
            (container?.scrollLeft ?? 0),
          blockId: blockSelection.blockId,
        };
      })
      .filter(rect => !!rect);

    return next({ selectionRects: result });
  }

  return;
};

function covers(rect1: SelectionRect, rect2: SelectionRect): boolean {
  return (
    rect1.left <= rect2.left &&
    rect1.top <= rect2.top &&
    rect1.left + rect1.width >= rect2.left + rect2.width &&
    rect1.top + rect1.height >= rect2.top + rect2.height
  );
}

function intersects(rect1: SelectionRect, rect2: SelectionRect): boolean {
  return (
    rect1.left <= rect2.left + rect2.width &&
    rect1.left + rect1.width >= rect2.left &&
    rect1.top <= rect2.top + rect2.height &&
    rect1.top + rect1.height >= rect2.top
  );
}

function merge(rect1: SelectionRect, rect2: SelectionRect): SelectionRect {
  const left = Math.min(rect1.left, rect2.left);
  const top = Math.min(rect1.top, rect2.top);
  const right = Math.max(rect1.left + rect1.width, rect2.left + rect2.width);
  const bottom = Math.max(rect1.top + rect1.height, rect2.top + rect2.height);

  return {
    width: right - left,
    height: bottom - top,
    top,
    left,
  };
}

export function filterCoveringRects(rects: SelectionRect[]): SelectionRect[] {
  let mergedRects: SelectionRect[] = [];
  let hasChanges: boolean;

  do {
    hasChanges = false;
    const newMergedRects: SelectionRect[] = [...mergedRects];

    for (const rect of rects) {
      let merged = false;

      for (let i = 0; i < newMergedRects.length; i++) {
        if (covers(newMergedRects[i], rect)) {
          merged = true;
          break;
        } else if (intersects(newMergedRects[i], rect)) {
          newMergedRects[i] = merge(newMergedRects[i], rect);
          merged = true;
          hasChanges = true;
          break;
        }
      }

      if (!merged) {
        newMergedRects.push(rect);
      }
    }

    if (!hasChanges) {
      for (let i = 0; i < newMergedRects.length; i++) {
        for (let j = i + 1; j < newMergedRects.length; j++) {
          if (intersects(newMergedRects[i], newMergedRects[j])) {
            newMergedRects[i] = merge(newMergedRects[i], newMergedRects[j]);
            newMergedRects.splice(j, 1);
            hasChanges = true;
            break;
          }
        }
      }
    }

    mergedRects = newMergedRects;
  } while (hasChanges);

  return mergedRects;
}

export function getRangeRects(
  range: Range,
  container: HTMLElement | null
): SelectionRect[] {
  const nativeRects = Array.from(range.getClientRects());
  const containerRect = container?.getBoundingClientRect();
  const rectsWithoutFiltered = nativeRects
    .map(rect => ({
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      top: rect.top - (containerRect?.top ?? 0) + (container?.scrollTop ?? 0),
      left:
        rect.left - (containerRect?.left ?? 0) + (container?.scrollLeft ?? 0),
    }))
    .filter(rect => rect.width > 0 && rect.height > 0);

  return filterCoveringRects(rectsWithoutFiltered);
}
