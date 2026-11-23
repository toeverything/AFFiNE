import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import type { DeltaInsert } from '@blocksuite/store';
import { html, LitElement, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { INLINE_ROOT_ATTR, ZERO_WIDTH_FOR_EMPTY_LINE } from '../consts.js';
import type { InlineRootElement } from '../inline-editor.js';
import { EmbedGap } from './embed-gap.js';

export class VLine extends LitElement {
  get inlineEditor() {
    const rootElement = this.closest(
      `[${INLINE_ROOT_ATTR}]`
    ) as InlineRootElement;
    if (!rootElement) {
      throw new BlockSuiteError(
        BlockSuiteError.ErrorCode.ValueNotExists,
        'v-line must be inside a v-root'
      );
    }
    const inlineEditor = rootElement.inlineEditor;
    if (!inlineEditor) {
      throw new BlockSuiteError(
        BlockSuiteError.ErrorCode.ValueNotExists,
        'v-line must be inside a v-root with inline-editor'
      );
    }

    return inlineEditor;
  }

  get vElements() {
    return Array.from(this.querySelectorAll('v-element'));
  }

  get vTextContent() {
    return this.vElements.reduce((acc, el) => acc + el.delta.insert, '');
  }

  get vTextLength() {
    return this.vElements.reduce((acc, el) => acc + el.delta.insert.length, 0);
  }

  // you should use vElements.length or vTextLength because v-element corresponds to the actual delta
  get vTexts() {
    return Array.from(this.querySelectorAll('v-text'));
  }

  override createRenderRoot() {
    return this;
  }

  protected override firstUpdated(): void {
    this.style.display = 'block';

    this.addEventListener('mousedown', e => {
      if (e.detail >= 2 && this.startOffset === this.endOffset) {
        e.preventDefault();
        return;
      }

      if (e.detail >= 3) {
        e.preventDefault();
        this.inlineEditor.setInlineRange({
          index: this.startOffset,
          length: this.endOffset - this.startOffset,
        });
      }
    });
  }

  // vTexts.length > 0 does not mean the line is not empty,
  override async getUpdateComplete() {
    const result = await super.getUpdateComplete();
    await Promise.all(this.vElements.map(el => el.updateComplete));
    return result;
  }

  override render() {
    if (!this.isConnected) return;

    if (this.inlineEditor.vLineRenderer) {
      return this.inlineEditor.vLineRenderer(this);
    }
    return this.renderVElements();
  }

  renderVElements() {
    if (this.elements.length === 0) {
      // don't use v-element because it not correspond to the actual delta
      return html`
        <div><v-text .str=${ZERO_WIDTH_FOR_EMPTY_LINE}></v-text></div>
      `;
    }

    const inlineEditor = this.inlineEditor;
    const renderElements = this.elements.flatMap(([template, delta], index) => {
      if (inlineEditor.isEmbed(delta)) {
        if (delta.insert.length !== 1) {
          throw new BlockSuiteError(
            ErrorCode.InlineEditorError,
            `The length of embed node should only be 1.
            This seems to be an internal issue with inline editor.
            Please go to https://github.com/toeverything/blocksuite/issues
            to report it.`
          );
        }
        // we add `EmbedGap` to make cursor can be placed between embed elements
        if (index === 0) {
          const nextDelta = this.elements[index + 1]?.[1];
          if (!nextDelta || inlineEditor.isEmbed(nextDelta)) {
            return [EmbedGap, template, EmbedGap];
          } else {
            return [EmbedGap, template];
          }
        } else {
          const nextDelta = this.elements[index + 1]?.[1];
          if (!nextDelta || inlineEditor.isEmbed(nextDelta)) {
            return [template, EmbedGap];
          } else {
            return [template];
          }
        }
      }
      return template;
    });

    // prettier will generate \n and cause unexpected space and line break
    // prettier-ignore
    return html`<div style=${styleMap({
      // this padding is used to make cursor can be placed at the
      // start and end of the line when the first and last element is embed element
      padding: '0 0.5px',
      display: 'inline-block',
    })}>${renderElements}</div>`;
  }

  @property({ attribute: false })
  accessor elements: [TemplateResult<1>, DeltaInsert][] = [];

  @property({ attribute: false })
  accessor endOffset!: number;

  @property({ attribute: false })
  accessor index!: number;

  @property({ attribute: false })
  accessor startOffset!: number;
}

declare global {
  interface HTMLElementTagNameMap {
    'v-line': VLine;
  }
}
