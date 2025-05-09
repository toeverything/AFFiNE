import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import type { Text } from '@blocksuite/store';
import { css, html } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { DatabaseBlockComponent } from '../../database-block.js';

export class DatabaseTitle extends WithDisposable(ShadowlessElement) {
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
  `;

  private readonly compositionEnd = () => {
    this.titleText.replace(0, this.titleText.length, this.input.value);
  };

  private readonly onBlur = () => {
    this.isFocus = false;
  };

  private readonly onFocus = () => {
    this.isFocus = true;
    if (this.database?.viewSelection$?.value) {
      this.database?.setSelection(undefined);
    }
  };

  private readonly onInput = (e: InputEvent) => {
    this.text = this.input.value;
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
    if (!this.isFocus) {
      this.input.value = this.titleText.toString();
      this.text = this.input.value;
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
    const isEmpty = !this.text;

    const classList = classMap({
      'affine-database-title': true,
      ellipsis: !this.isFocus,
    });
    const untitledStyle = styleMap({
      height: isEmpty ? 'auto' : 0,
      opacity: isEmpty && !this.isFocus ? 1 : 0,
    });
    return html` <div
      class="${classList}"
      data-title-empty="${isEmpty}"
      data-title-focus="${this.isFocus}"
    >
      <div class="text" style="${untitledStyle}">Untitled</div>
      <div class="text">${this.text}</div>
      <textarea
        .disabled="${this.readonly}"
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

  @state()
  accessor isComposing = false;

  @state()
  private accessor isFocus = false;

  @property({ attribute: false })
  accessor onPressEnterKey: (() => void) | undefined = undefined;

  @property({ attribute: false })
  accessor readonly!: boolean;

  @state()
  private accessor text = '';

  @property({ attribute: false })
  accessor titleText!: Text;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-database-title': DatabaseTitle;
  }
}
