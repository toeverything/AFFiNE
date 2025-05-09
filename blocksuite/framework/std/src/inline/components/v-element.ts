import { DisposableGroup } from '@blocksuite/global/disposable';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { SignalWatcher } from '@blocksuite/global/lit';
import type { BaseTextAttributes, DeltaInsert } from '@blocksuite/store';
import { effect, signal } from '@preact/signals-core';
import { html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { ZERO_WIDTH_FOR_EMPTY_LINE } from '../consts.js';
import type { InlineEditor } from '../inline-editor.js';
import { isInlineRangeIntersect } from '../utils/inline-range.js';

export class VElement<
  T extends BaseTextAttributes = BaseTextAttributes,
> extends SignalWatcher(LitElement) {
  readonly disposables = new DisposableGroup();

  readonly selected = signal(false);

  override connectedCallback(): void {
    super.connectedCallback();

    this.disposables.add(
      effect(() => {
        const inlineRange = this.inlineEditor?.inlineRange$.value;
        this.selected.value =
          !!inlineRange &&
          isInlineRangeIntersect(inlineRange, {
            index: this.startOffset,
            length: this.endOffset - this.startOffset,
          });
      })
    );
  }

  override createRenderRoot() {
    return this;
  }

  override async getUpdateComplete(): Promise<boolean> {
    const result = await super.getUpdateComplete();
    const span = this.querySelector('[data-v-element="true"]') as HTMLElement;
    const el = span.firstElementChild as LitElement;
    await el.updateComplete;
    const vTexts = Array.from(this.querySelectorAll('v-text'));
    await Promise.all(vTexts.map(vText => vText.updateComplete));
    return result;
  }

  override render() {
    const inlineEditor = this.inlineEditor;
    const attributeRenderer = inlineEditor.attributeService.attributeRenderer;
    const renderProps: Parameters<typeof attributeRenderer>[0] = {
      delta: this.delta,
      selected: this.selected.value,
      startOffset: this.startOffset,
      endOffset: this.endOffset,
      lineIndex: this.lineIndex,
      editor: inlineEditor,
    };

    const isEmbed = inlineEditor.isEmbed(this.delta);
    if (isEmbed) {
      if (this.delta.insert.length !== 1) {
        throw new BlockSuiteError(
          ErrorCode.InlineEditorError,
          `The length of embed node should only be 1.
          This seems to be an internal issue with inline editor.
          Please go to https://github.com/toeverything/blocksuite/issues
          to report it.`
        );
      }

      return html`<span
        data-v-embed="true"
        data-v-element="true"
        contenteditable="false"
        style=${styleMap({ userSelect: 'none' })}
        >${attributeRenderer(renderProps)}</span
      >`;
    }

    // we need to avoid \n appearing before and after the span element, which will
    // cause the unexpected space
    return html`<span data-v-element="true"
      >${attributeRenderer(renderProps)}</span
    >`;
  }

  @property({ type: Object })
  accessor delta: DeltaInsert<T> = {
    insert: ZERO_WIDTH_FOR_EMPTY_LINE,
  };

  @property({ attribute: false })
  accessor endOffset!: number;

  @property({ attribute: false })
  accessor inlineEditor!: InlineEditor;

  @property({ attribute: false })
  accessor lineIndex!: number;

  @property({ attribute: false })
  accessor startOffset!: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'v-element': VElement;
  }
}
