import type { InlineRange, InlineRangeProvider } from '@blocksuite/std/inline';
import { signal } from '@preact/signals-core';

import { TextSelection } from '../../selection/index.js';
import type { BlockComponent } from '../../view/element/block-component.js';
import { isActiveInEditor } from './active.js';

export const getInlineRangeProvider: (
  element: BlockComponent
) => InlineRangeProvider | null = element => {
  const editorHost = element.host;
  const selectionManager = editorHost.selection;
  const rangeManager = editorHost.range;

  if (!selectionManager || !rangeManager) {
    return null;
  }

  const calculateInlineRange = (
    range: Range,
    textSelection: TextSelection
  ): InlineRange | null => {
    const { from, to } = textSelection;

    if (from.blockId === element.blockId) {
      return {
        index: from.index,
        length: from.length,
      };
    }

    if (to && to.blockId === element.blockId) {
      return {
        index: to.index,
        length: to.length,
      };
    }

    if (!element.model.text) {
      return null;
    }

    if (
      textSelection.isInSameBlock() &&
      textSelection.from.blockId !== element.blockId
    ) {
      return null;
    }

    const elementRange = rangeManager.textSelectionToRange(
      selectionManager.create(TextSelection, {
        from: {
          index: 0,
          blockId: element.blockId,
          length: element.model.text.length,
        },
        to: null,
      })
    );

    if (
      elementRange &&
      elementRange.compareBoundaryPoints(Range.START_TO_START, range) > -1 &&
      elementRange.compareBoundaryPoints(Range.END_TO_END, range) < 1
    ) {
      return {
        index: 0,
        length: element.model.text.length,
      };
    }

    return null;
  };

  const setInlineRange = (inlineRange: InlineRange | null) => {
    // skip `setInlineRange` from `inlineEditor` when composing happens across blocks,
    // selection will be updated in `range-binding`
    if (rangeManager.binding?.isComposing) return;

    if (!inlineRange) {
      selectionManager.clear(['text']);
    } else {
      const textSelection = selectionManager.create(TextSelection, {
        from: {
          blockId: element.blockId,
          index: inlineRange.index,
          length: inlineRange.length,
        },
        to: null,
      });
      selectionManager.setGroup('note', [textSelection]);
    }
  };
  const inlineRange$: InlineRangeProvider['inlineRange$'] = signal(null);

  element.disposables.add(
    selectionManager.slots.changed.subscribe(selections => {
      if (!isActiveInEditor(editorHost)) return;

      const textSelection = selections.find(s => s.type === 'text') as
        | TextSelection
        | undefined;
      const range = rangeManager.value;
      if (!range || !textSelection) {
        inlineRange$.value = null;
        return;
      }

      const inlineRange = calculateInlineRange(range, textSelection);
      inlineRange$.value = inlineRange;
    })
  );

  return {
    setInlineRange,
    inlineRange$,
  };
};
