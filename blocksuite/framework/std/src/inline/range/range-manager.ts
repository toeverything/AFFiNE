import { LifeCycleWatcher } from '../../extension/index.js';
import { TextSelection } from '../../selection/index.js';
import type { BlockComponent } from '../../view/element/block-component.js';
import { BLOCK_ID_ATTR } from '../../view/index.js';
import { INLINE_ROOT_ATTR } from '../consts.js';
import type { InlineRootElement } from '../inline-editor.js';
import { RANGE_QUERY_EXCLUDE_ATTR, RANGE_SYNC_EXCLUDE_ATTR } from './consts.js';
import { RangeBinding } from './range-binding.js';

/**
 * CRUD for Range and TextSelection
 */
export class RangeManager extends LifeCycleWatcher {
  static override readonly key = 'rangeManager';

  binding: RangeBinding | null = null;

  get value() {
    const selection = document.getSelection();
    if (!selection) {
      return;
    }
    if (selection.rangeCount === 0) return null;
    return selection.getRangeAt(0);
  }

  private _isRangeSyncExcluded(el: Element) {
    return !!el.closest(`[${RANGE_SYNC_EXCLUDE_ATTR}="true"]`);
  }

  clear() {
    const selection = document.getSelection();
    if (!selection) return;
    selection.removeAllRanges();

    if (document.activeElement === this.std.host) {
      return;
    }

    const topContenteditableElement = this.std.host.querySelector(
      '[contenteditable="true"]'
    );
    if (
      topContenteditableElement instanceof HTMLElement &&
      topContenteditableElement.contains(document.activeElement)
    ) {
      topContenteditableElement.blur();
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }

  getClosestBlock(node: Node) {
    const el = node instanceof Element ? node : node.parentElement;
    if (!el) return null;
    const block = el.closest<BlockComponent>(`[${BLOCK_ID_ATTR}]`);
    if (!block) return null;
    if (this._isRangeSyncExcluded(block)) return null;
    return block;
  }

  getClosestInlineEditor(node: Node) {
    const el = node instanceof Element ? node : node.parentElement;
    if (!el) return null;
    const inlineRoot = el.closest<InlineRootElement>(`[${INLINE_ROOT_ATTR}]`);
    if (!inlineRoot) return null;

    if (this._isRangeSyncExcluded(inlineRoot)) return null;

    return inlineRoot.inlineEditor;
  }

  /**
   * @example
   * aaa
   *   b[bb
   *     ccc
   * ddd
   *   ee]e
   *
   * all mode: [aaa, bbb, ccc, ddd, eee]
   * flat mode: [bbb, ccc, ddd, eee]
   * highest mode: [bbb, ddd]
   *
   * match function will be evaluated before filtering using mode
   */
  getSelectedBlockComponentsByRange(
    range: Range,
    options: {
      match?: (el: BlockComponent) => boolean;
      mode?: 'all' | 'flat' | 'highest';
    } = {}
  ): BlockComponent[] {
    const { mode = 'all', match = () => true } = options;

    let result = Array.from<BlockComponent>(
      this.std.host.querySelectorAll(
        `[${BLOCK_ID_ATTR}]:not([${RANGE_QUERY_EXCLUDE_ATTR}="true"])`
      )
    ).filter(el => range.intersectsNode(el) && match(el));

    if (result.length === 0) {
      return [];
    }

    const firstElement = this.getClosestBlock(range.startContainer);
    if (!firstElement) return [];
    const firstElementIndex = result.indexOf(firstElement);
    if (firstElementIndex === -1) return [];

    if (mode === 'flat') {
      result = result.slice(firstElementIndex);
    } else if (mode === 'highest') {
      result = result.slice(firstElementIndex);
      let parent = result[0];
      result = result.filter((node, index) => {
        if (index === 0) return true;
        if (
          parent.compareDocumentPosition(node) &
          Node.DOCUMENT_POSITION_CONTAINED_BY
        ) {
          return false;
        } else {
          parent = node;
          return true;
        }
      });
    }

    return result;
  }

  override mounted() {
    this.binding = new RangeBinding(this);
  }

  queryInlineEditorByPath(path: string) {
    const block = this.std.host.view.getBlock(path);
    if (!block) return null;

    const inlineRoot = block.querySelector<InlineRootElement>(
      `[${INLINE_ROOT_ATTR}]`
    );
    if (!inlineRoot) return null;

    if (this._isRangeSyncExcluded(inlineRoot)) return null;

    return inlineRoot.inlineEditor;
  }

  rangeToTextSelection(range: Range, reverse = false): TextSelection | null {
    const { startContainer, endContainer } = range;

    const startBlock = this.getClosestBlock(startContainer);
    const endBlock = this.getClosestBlock(endContainer);
    if (!startBlock || !endBlock) {
      return null;
    }

    const startInlineEditor = this.getClosestInlineEditor(startContainer);
    const endInlineEditor = this.getClosestInlineEditor(endContainer);
    if (!startInlineEditor || !endInlineEditor) {
      return null;
    }

    const startInlineRange = startInlineEditor.toInlineRange(range);
    const endInlineRange = endInlineEditor.toInlineRange(range);
    if (!startInlineRange || !endInlineRange) {
      return null;
    }

    return this.std.host.selection.create(TextSelection, {
      from: {
        blockId: startBlock.blockId,
        index: startInlineRange.index,
        length: startInlineRange.length,
      },
      to:
        startBlock === endBlock
          ? null
          : {
              blockId: endBlock.blockId,
              index: endInlineRange.index,
              length: endInlineRange.length,
            },
      reverse,
    });
  }

  set(range: Range) {
    const selection = document.getSelection();
    if (!selection) return;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  syncRangeToTextSelection(range: Range, isRangeReversed: boolean) {
    const selectionManager = this.std.host.selection;

    if (!range) {
      selectionManager.clear(['text']);
      return;
    }

    const textSelection = this.rangeToTextSelection(range, isRangeReversed);
    if (textSelection) {
      selectionManager.setGroup('note', [textSelection]);
    } else {
      selectionManager.clear(['text']);
    }
  }

  syncTextSelectionToRange(selection: TextSelection) {
    const range = this.textSelectionToRange(selection);
    if (range) {
      this.set(range);
    } else {
      this.clear();
    }
  }

  textSelectionToRange(selection: TextSelection): Range | null {
    const { from, to } = selection;

    const fromInlineEditor = this.queryInlineEditorByPath(from.blockId);
    if (!fromInlineEditor) return null;

    if (selection.isInSameBlock()) {
      return fromInlineEditor.toDomRange({
        index: from.index,
        length: from.length,
      });
    }

    if (!to) return null;
    const toInlineEditor = this.queryInlineEditorByPath(to.blockId);
    if (!toInlineEditor) return null;

    const fromRange = fromInlineEditor.toDomRange({
      index: from.index,
      length: from.length,
    });
    const toRange = toInlineEditor.toDomRange({
      index: to.index,
      length: to.length,
    });

    if (!fromRange || !toRange) return null;

    const range = document.createRange();
    const startContainer = fromRange.startContainer;
    const startOffset = fromRange.startOffset;
    const endContainer = toRange.endContainer;
    const endOffset = toRange.endOffset;
    range.setStart(startContainer, startOffset);
    range.setEnd(endContainer, endOffset);

    return range;
  }
}
