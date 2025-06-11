import type { BaseTextAttributes } from '@blocksuite/store';

import type { InlineEditor } from '../inline-editor.js';
import type { InlineRange } from '../types.js';
import {
  isInEmbedElement,
  isInEmbedGap,
  isInEmptyLine,
} from '../utils/index.js';
import { isMaybeInlineRangeEqual } from '../utils/inline-range.js';
import { transformInput } from '../utils/transform-input.js';
import type { BeforeinputHookCtx, CompositionEndHookCtx } from './hook.js';

export class EventService<TextAttributes extends BaseTextAttributes> {
  private _compositionInlineRange: InlineRange | null = null;

  private _isComposing = false;

  private readonly _isRangeCompletelyInRoot = (range: Range) => {
    if (range.commonAncestorContainer.ownerDocument !== document) return false;

    const rootElement = this.editor.rootElement;
    if (!rootElement) return false;

    const rootRange = document.createRange();
    rootRange.selectNode(rootElement);

    if (
      range.startContainer.compareDocumentPosition(range.endContainer) &
      Node.DOCUMENT_POSITION_FOLLOWING
    ) {
      return (
        rootRange.comparePoint(range.startContainer, range.startOffset) >= 0 &&
        rootRange.comparePoint(range.endContainer, range.endOffset) <= 0
      );
    } else {
      return (
        rootRange.comparePoint(range.endContainer, range.startOffset) >= 0 &&
        rootRange.comparePoint(range.startContainer, range.endOffset) <= 0
      );
    }
  };

  private readonly _onBeforeInput = (event: InputEvent) => {
    const range = this.editor.rangeService.getNativeRange();
    if (
      this.editor.isReadonly ||
      this._isComposing ||
      !range ||
      !this._isRangeCompletelyInRoot(range)
    )
      return;

    let inlineRange = this.editor.toInlineRange(range);
    if (!inlineRange) return;

    let ifHandleTargetRange = true;

    if (event.inputType.startsWith('delete')) {
      if (
        isInEmbedGap(range.commonAncestorContainer) &&
        inlineRange.length === 0 &&
        inlineRange.index > 0
      ) {
        inlineRange = {
          index: inlineRange.index - 1,
          length: 1,
        };
        ifHandleTargetRange = false;
      } else if (
        isInEmptyLine(range.commonAncestorContainer) &&
        inlineRange.length === 0 &&
        inlineRange.index > 0
        // eslint-disable-next-line sonarjs/no-duplicated-branches
      ) {
        // do not use target range when deleting across lines
        // https://github.com/toeverything/blocksuite/issues/5381
        inlineRange = {
          index: inlineRange.index - 1,
          length: 1,
        };
        ifHandleTargetRange = false;
      }
    }

    if (ifHandleTargetRange) {
      const targetRanges = event.getTargetRanges();
      if (targetRanges.length > 0) {
        const staticRange = targetRanges[0];
        const range = document.createRange();
        range.setStart(staticRange.startContainer, staticRange.startOffset);
        range.setEnd(staticRange.endContainer, staticRange.endOffset);
        const targetInlineRange = this.editor.toInlineRange(range);

        if (!isMaybeInlineRangeEqual(inlineRange, targetInlineRange)) {
          inlineRange = targetInlineRange;
        }
      }
    }

    if (!inlineRange) return;

    event.preventDefault();

    const ctx: BeforeinputHookCtx<TextAttributes> = {
      inlineEditor: this.editor,
      raw: event,
      inlineRange,
      data: event.data ?? event.dataTransfer?.getData('text/plain') ?? null,
      attributes: {} as TextAttributes,
    };
    this.editor.hooks.beforeinput?.(ctx);

    transformInput<TextAttributes>(
      ctx.raw.inputType,
      ctx.data,
      ctx.attributes,
      ctx.inlineRange,
      this.editor as never
    );

    this.editor.slots.inputting.next(event.data ?? '');
  };

  private readonly _onClick = (event: MouseEvent) => {
    // select embed element when click on it
    if (event.target instanceof Node && isInEmbedElement(event.target)) {
      const selection = document.getSelection();
      if (!selection) return;
      if (event.target instanceof HTMLElement) {
        const vElement = event.target.closest('v-element');
        if (vElement) {
          selection.selectAllChildren(vElement);
        }
      } else {
        const vElement = event.target.parentElement?.closest('v-element');
        if (vElement) {
          selection.selectAllChildren(vElement);
        }
      }
    }
  };

  private readonly _onCompositionEnd = async (event: CompositionEvent) => {
    this._isComposing = false;
    if (!this.editor.rootElement || !this.editor.rootElement.isConnected) {
      return;
    }

    const range = this.editor.rangeService.getNativeRange();
    if (
      this.editor.isReadonly ||
      !range ||
      !this._isRangeCompletelyInRoot(range)
    )
      return;

    this.editor.rerenderWholeEditor();
    await this.editor.waitForUpdate();

    const inlineRange = this._compositionInlineRange;
    if (!inlineRange) return;

    event.preventDefault();

    const ctx: CompositionEndHookCtx<TextAttributes> = {
      inlineEditor: this.editor,
      raw: event,
      inlineRange,
      data: event.data,
      attributes: {} as TextAttributes,
    };
    this.editor.hooks.compositionEnd?.(ctx);

    const { inlineRange: newInlineRange, data: newData } = ctx;
    if (newData && newData.length > 0) {
      this.editor.insertText(newInlineRange, newData, ctx.attributes);
      this.editor.setInlineRange({
        index: newInlineRange.index + newData.length,
        length: 0,
      });
    }

    this.editor.slots.inputting.next(event.data ?? '');
  };

  private readonly _onCompositionStart = (event: CompositionEvent) => {
    this._isComposing = true;
    if (!this.editor.rootElement) return;
    // embeds is not editable and it will break IME
    const embeds = this.editor.rootElement.querySelectorAll(
      '[data-v-embed="true"]'
    );
    embeds.forEach(embed => {
      embed.removeAttribute('contenteditable');
    });

    const range = this.editor.rangeService.getNativeRange();
    if (range) {
      this._compositionInlineRange = this.editor.toInlineRange(range);
    } else {
      this._compositionInlineRange = null;
    }

    this.editor.slots.inputting.next(event.data ?? '');
  };

  private readonly _onCompositionUpdate = (event: CompositionEvent) => {
    if (!this.editor.rootElement || !this.editor.rootElement.isConnected) {
      return;
    }

    const range = this.editor.rangeService.getNativeRange();
    if (
      this.editor.isReadonly ||
      !range ||
      !this._isRangeCompletelyInRoot(range)
    )
      return;

    this.editor.slots.inputting.next(event.data ?? '');
  };

  private readonly _onKeyDown = (event: KeyboardEvent) => {
    const inlineRange = this.editor.getInlineRange();
    if (!inlineRange) return;

    this.editor.slots.keydown.next(event);

    if (
      !event.shiftKey &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      if (inlineRange.length !== 0) return;

      const prevent = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      const deltas = this.editor.getDeltasByInlineRange(inlineRange);
      if (deltas.length === 2) {
        if (event.key === 'ArrowLeft' && this.editor.isEmbed(deltas[0][0])) {
          prevent();
          this.editor.setInlineRange({
            index: inlineRange.index - 1,
            length: 1,
          });
        } else if (
          event.key === 'ArrowRight' &&
          this.editor.isEmbed(deltas[1][0])
        ) {
          prevent();
          this.editor.setInlineRange({
            index: inlineRange.index,
            length: 1,
          });
        }
      } else if (deltas.length === 1) {
        const delta = deltas[0][0];
        if (this.editor.isEmbed(delta)) {
          if (event.key === 'ArrowLeft' && inlineRange.index - 1 >= 0) {
            prevent();
            this.editor.setInlineRange({
              index: inlineRange.index - 1,
              length: 1,
            });
          } else if (
            event.key === 'ArrowRight' &&
            inlineRange.index + 1 <= this.editor.yTextLength
          ) {
            prevent();
            this.editor.setInlineRange({
              index: inlineRange.index,
              length: 1,
            });
          }
        }
      }
    }
  };

  private readonly _onSelectionChange = () => {
    const rootElement = this.editor.rootElement;
    if (!rootElement) return;

    const previousInlineRange = this.editor.getInlineRange();
    if (this._isComposing) {
      return;
    }

    const selection = document.getSelection();
    if (!selection) return;
    if (selection.rangeCount === 0) {
      if (previousInlineRange !== null) {
        this.editor.setInlineRange(null);
      }

      return;
    }

    const range = selection.getRangeAt(0);
    if (!range.intersectsNode(rootElement)) {
      const isContainerSelected =
        range.endContainer.contains(rootElement) &&
        Array.from(range.endContainer.childNodes).filter(
          node => node instanceof HTMLElement
        ).length === 1 &&
        range.startContainer.contains(rootElement) &&
        Array.from(range.startContainer.childNodes).filter(
          node => node instanceof HTMLElement
        ).length === 1;
      if (isContainerSelected) {
        this.editor.focusEnd();
        return;
      } else {
        if (previousInlineRange !== null) {
          this.editor.setInlineRange(null);
        }
        return;
      }
    }

    const inlineRange = this.editor.toInlineRange(selection.getRangeAt(0));
    if (!isMaybeInlineRangeEqual(previousInlineRange, inlineRange)) {
      this.editor.rangeService.lockSyncInlineRange();
      this.editor.setInlineRange(inlineRange);
      this.editor.rangeService.unlockSyncInlineRange();
    }
  };

  mount = () => {
    const eventSource = this.editor.eventSource;
    const rootElement = this.editor.rootElement;

    if (!this.editor.inlineRangeProviderOverride) {
      this.editor.disposables.addFromEvent(
        document,
        'selectionchange',
        this._onSelectionChange
      );
    }

    if (!eventSource) {
      console.error('Mount inline editor without event source ready');
      return;
    }

    this.editor.disposables.addFromEvent(
      eventSource,
      'beforeinput',
      this._onBeforeInput
    );
    this.editor.disposables.addFromEvent(
      eventSource,
      'compositionstart',
      this._onCompositionStart
    );
    this.editor.disposables.addFromEvent(
      eventSource,
      'compositionupdate',
      this._onCompositionUpdate
    );
    this.editor.disposables.addFromEvent(eventSource, 'compositionend', e => {
      this._onCompositionEnd(e).catch(console.error);
    });
    this.editor.disposables.addFromEvent(
      eventSource,
      'keydown',
      this._onKeyDown
    );
    if (rootElement) {
      this.editor.disposables.addFromEvent(rootElement, 'click', this._onClick);
    }
  };

  get isComposing() {
    return this._isComposing;
  }

  constructor(readonly editor: InlineEditor<TextAttributes>) {}
}
