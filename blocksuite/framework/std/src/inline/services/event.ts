import { IS_ANDROID } from '@blocksuite/global/env';
import type { BaseTextAttributes } from '@blocksuite/store';

import { INLINE_ROOT_ATTR } from '../consts.js';
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

  private readonly _getClosestInlineRoot = (node: Node): Element | null => {
    const el = node instanceof Element ? node : node.parentElement;
    return el?.closest(`[${INLINE_ROOT_ATTR}]`) ?? null;
  };

  private readonly _isRangeCompletelyInRoot = (range: Range) => {
    if (range.commonAncestorContainer.ownerDocument !== document) return false;

    const rootElement = this.editor.rootElement;
    if (!rootElement) return false;
    // Avoid `Range.comparePoint` here — Firefox/Chrome have subtle differences
    // around selection points in `contenteditable` and comment marker nodes.
    const containsStart =
      range.startContainer === rootElement ||
      rootElement.contains(range.startContainer);
    const containsEnd =
      range.endContainer === rootElement ||
      rootElement.contains(range.endContainer);
    return containsStart && containsEnd;
  };

  private readonly _onBeforeInput = async (event: InputEvent) => {
    const range = this.editor.rangeService.getNativeRange();
    if (this.editor.isReadonly || !range) return;
    const rootElement = this.editor.rootElement;
    if (!rootElement) return;

    const startInRoot =
      range.startContainer === rootElement ||
      rootElement.contains(range.startContainer);
    const endInRoot =
      range.endContainer === rootElement ||
      rootElement.contains(range.endContainer);

    // Not this inline editor.
    if (!startInRoot && !endInRoot) return;

    // If selection spans into another inline editor, let the range binding handle it.
    if (startInRoot !== endInRoot) {
      const otherNode = startInRoot ? range.endContainer : range.startContainer;
      const otherRoot = this._getClosestInlineRoot(otherNode);
      if (otherRoot && otherRoot !== rootElement) return;
    }

    if (this._isComposing) {
      if (IS_ANDROID && event.inputType === 'insertCompositionText') {
        const compositionInlineRange = this.editor.toInlineRange(range);
        if (compositionInlineRange) {
          this._compositionInlineRange = compositionInlineRange;
        }
      }
      return;
    }

    // Always prevent native DOM mutations inside inline editor. Browsers (notably
    // Firefox) may remove Lit marker comment nodes during native edits, which
    // will crash subsequent Lit updates with `ChildPart has no parentNode`.
    event.preventDefault();

    let inlineRange = this.editor.toInlineRange(range);
    if (!inlineRange) {
      // Some browsers may report selection points on non-text nodes inside
      // `contenteditable`. Prefer the target range if available.
      try {
        const targetRanges = event.getTargetRanges();
        if (targetRanges.length > 0) {
          const staticRange = targetRanges[0];
          const targetRange = document.createRange();
          targetRange.setStart(
            staticRange.startContainer,
            staticRange.startOffset
          );
          targetRange.setEnd(staticRange.endContainer, staticRange.endOffset);
          inlineRange = this.editor.toInlineRange(targetRange);
        }
      } catch {
        // ignore
      }
    }
    if (!inlineRange && startInRoot !== endInRoot) {
      // Clamp a partially-outside selection to this editor so native editing
      // won't touch Lit marker nodes.
      const pointRange = document.createRange();
      if (startInRoot) {
        pointRange.setStart(range.startContainer, range.startOffset);
        pointRange.setEnd(range.startContainer, range.startOffset);
        const startPoint = this.editor.toInlineRange(pointRange);
        if (startPoint) {
          inlineRange = {
            index: startPoint.index,
            length: this.editor.yTextLength - startPoint.index,
          };
        }
      } else {
        pointRange.setStart(range.endContainer, range.endOffset);
        pointRange.setEnd(range.endContainer, range.endOffset);
        const endPoint = this.editor.toInlineRange(pointRange);
        if (endPoint) {
          inlineRange = {
            index: 0,
            length: endPoint.index,
          };
        }
      }
    }
    if (!inlineRange) {
      // Try to recover from an unexpected DOM/selection state by rebuilding the
      // editor DOM and retrying the range conversion.
      this.editor.rerenderWholeEditor();
      await this.editor.waitForUpdate();
      const newRange = this.editor.rangeService.getNativeRange();
      inlineRange = newRange ? this.editor.toInlineRange(newRange) : null;
      if (!inlineRange) return;
    }

    let ifHandleTargetRange = true;

    if (
      event.inputType.startsWith('delete') &&
      (isInEmbedGap(range.commonAncestorContainer) ||
        // https://github.com/toeverything/blocksuite/issues/5381
        isInEmptyLine(range.commonAncestorContainer)) &&
      inlineRange.length === 0 &&
      inlineRange.index > 0
    ) {
      // do not use target range when deleting across lines
      inlineRange = {
        index: inlineRange.index - 1,
        length: 1,
      };
      ifHandleTargetRange = false;
    }

    if (ifHandleTargetRange) {
      const targetRanges = event.getTargetRanges();
      if (targetRanges.length > 0) {
        const staticRange = targetRanges[0];
        const range = document.createRange();
        range.setStart(staticRange.startContainer, staticRange.startOffset);
        range.setEnd(staticRange.endContainer, staticRange.endOffset);
        const targetInlineRange = this.editor.toInlineRange(range);

        // Ignore an un-resolvable target range to avoid swallowing the input.
        if (
          targetInlineRange &&
          !isMaybeInlineRangeEqual(inlineRange, targetInlineRange)
        ) {
          inlineRange = targetInlineRange;
        }
      }
    }
    if (!inlineRange) return;

    if (IS_ANDROID) {
      this.editor.rerenderWholeEditor();
      await this.editor.waitForUpdate();
      if (
        event.inputType === 'deleteContentBackward' &&
        !(inlineRange.index === 0 && inlineRange.length === 0)
      ) {
        // when press backspace at offset 1, double characters will be removed.
        // because we mock backspace key event `androidBindKeymapPatch` in blocksuite/framework/std/src/event/keymap.ts
        // so we need to stop the event propagation to prevent the double characters removal.
        event.stopPropagation();
      }
    }

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

    this.editor.disposables.addFromEvent(eventSource, 'beforeinput', e => {
      this._onBeforeInput(e).catch(console.error);
    });
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
