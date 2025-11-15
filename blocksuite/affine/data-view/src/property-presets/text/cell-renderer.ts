import { html } from 'lit';
import { query } from 'lit/decorators.js';

import { BaseCellRenderer } from '../../core/property/index.js';
import { createFromBaseCellRenderer } from '../../core/property/renderer.js';
import { createIcon } from '../../core/utils/uni-icon.js';
import { textInputStyle, textStyle } from './cell-renderer-css.js';
import { textPropertyModelConfig } from './define.js';

export class TextCell extends BaseCellRenderer<string, string> {
  @query('input')
  private accessor _inputEle!: HTMLInputElement;

  private readonly _keydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.isComposing) {
      this._setValue();
      setTimeout(() => {
        this.selectCurrentCell(false);
      });
    }
  };

  private readonly _setValue = (str: string = this._inputEle?.value) => {
    if (this._inputEle) {
      this._inputEle.value = `${this.value ?? ''}`;
    }
    this.valueSetNextTick(str);
  };

  focusEnd = () => {
    if (!this._inputEle) return;

    const end = this._inputEle.value.length;
    this._inputEle.focus();
    this._inputEle.setSelectionRange(end, end);
  };

  override afterEnterEditingMode() {
    this.focusEnd();
  }

  override beforeExitEditingMode() {
    this._setValue();
  }

  override render() {
    if (this.isEditing$.value) {
      return html`<input
        .value="${this.value ?? ''}"
        @keydown="${this._keydown}"
        class="${textInputStyle}"
      />`;
    } else {
      return html`<div class="${textStyle}">${this.value ?? ''}</div>`;
    }
  }
}

export const textPropertyConfig = textPropertyModelConfig.createPropertyMeta({
  icon: createIcon('TextIcon'),

  cellRenderer: {
    view: createFromBaseCellRenderer(TextCell),
  },
});
