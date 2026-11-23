import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import type { DataViewUILogicBase } from '@blocksuite/data-view';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { Text } from '@blocksuite/store';
import { signal } from '@preact/signals-core';
import { css, html } from 'lit';
import { property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { DatabaseBlockComponent } from '../../database-block.js';

export class DatabaseTitle extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .affine-database-title {
      position: relative;
      flex: 1;
      font-family: inherit;
      font-size: 20px;
      line-height: 28px;
      font-weight: 600;
      color: var(--affine-text-primary-color);
      overflow: hidden;
    }

    .affine-database-title textarea {
      font-size: inherit;
      line-height: inherit;
      font-weight: inherit;
      letter-spacing: inherit;
      font-family: inherit;
      border: none;
      background-color: transparent;
      padding: 0;
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      right: 0;
      outline: none;
      resize: none;
      scrollbar-width: none;
    }

    .affine-database-title .text {
      user-select: none;
      opacity: 0;
      white-space: pre-wrap;
    }

    .affine-database-title[data-title-focus='false'] textarea {
      opacity: 0;
    }

    .affine-database-title[data-title-focus='false'] .text {
      text-overflow: ellipsis;
      overflow: hidden;
      opacity: 1;
      white-space: pre;
    }

    .affine-database-title [data-title-empty='true']::before {
      content: 'Untitled';
      position: absolute;
      pointer-events: none;
      color: var(--affine-text-primary-color);
    }

    .affine-database-title [data-title-focus='true']::before {
      color: var(--affine-placeholder-color);
    }

    .affine-database-title.comment-highlighted {
      border-bottom: 2px solid
        ${unsafeCSSVarV2('block/comment/highlightUnderline')};
      background-color: ${unsafeCSSVarV2('block/comment/highlightActive')};
    }
  `;

  private readonly compositionEnd = () => {
    this.isComposing$.value = false;
    this.titleText.replace(0, this.titleText.length, this.input.value);
  };

  private readonly onBlur = () => {
    this.isFocus$.value = false;
  };

  private readonly onFocus = () => {
    this.isFocus$.value = true;
    if (this.dataViewLogic.selection$.value) {
      this.dataViewLogic.setSelection(undefined);
    }
  };

  private readonly onInput = (e: InputEvent) => {
    this.text$.value = this.input.value;
    if (!e.isComposing) {
      this.titleText.replace(0, this.titleText.length, this.input.value);
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      this.onPressEnterKey?.();
      return;
    }
  };

  updateText = () => {
    if (!this.isFocus$.value) {
      this.input.value = this.titleText.toString();
      this.text$.value = this.input.value;
    }
  };

  get database() {
    return this.closest<DatabaseBlockComponent>('affine-database');
  }

  override connectedCallback() {
    super.connectedCallback();
    requestAnimationFrame(() => {
      this.updateText();
    });
    this.titleText.yText.observe(this.updateText);
    this.disposables.add(() => {
      this.titleText.yText.unobserve(this.updateText);
    });
  }

  override render() {
    const isEmpty = !this.text$.value;

    const classList = classMap({
      'affine-database-title': true,
      ellipsis: !this.isFocus$.value,
      'comment-highlighted': this.database?.isCommentHighlighted ?? false,
    });
    const untitledStyle = styleMap({
      height: isEmpty ? 'auto' : 0,
      opacity: isEmpty && !this.isFocus$.value ? 1 : 0,
    });
    return html` <div
      class="${classList}"
      data-title-empty="${isEmpty}"
      data-title-focus="${this.isFocus$.value}"
    >
      <div class="text" style="${untitledStyle}">Untitled</div>
      <div class="text">${this.text$.value}</div>
      <textarea
        .disabled="${this.readonly$.value}"
        @input="${this.onInput}"
        @keydown="${this.onKeyDown}"
        @copy="${stopPropagation}"
        @paste="${stopPropagation}"
        @focus="${this.onFocus}"
        @blur="${this.onBlur}"
        @compositionend="${this.compositionEnd}"
        data-block-is-database-title="true"
        title="${this.titleText.toString()}"
      ></textarea>
    </div>`;
  }

  @query('textarea')
  private accessor input!: HTMLTextAreaElement;

  private readonly isComposing$ = signal(false);
  private readonly isFocus$ = signal(false);

  private onPressEnterKey() {
    this.input.blur();
  }

  get readonly$() {
    return this.dataViewLogic.view.readonly$;
  }

  private readonly text$ = signal('');

  @property({ attribute: false })
  accessor titleText!: Text;

  @property({ attribute: false })
  accessor dataViewLogic!: DataViewUILogicBase;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-database-title': DatabaseTitle;
  }
}
