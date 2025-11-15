import { IS_MAC } from '@blocksuite/global/env';
import { html } from 'lit';
import { query } from 'lit/decorators.js';

import { BaseCellRenderer } from '../../core/property/index.js';
import { createFromBaseCellRenderer } from '../../core/property/renderer.js';
import { stopPropagation } from '../../core/utils/event.js';
import { createIcon } from '../../core/utils/uni-icon.js';
import { numberInputStyle, numberStyle } from './cell-renderer-css.js';
import { numberPropertyModelConfig } from './define.js';
import type { NumberPropertyDataType } from './types.js';
import {
  formatNumber,
  type NumberFormat,
  parseNumber,
} from './utils/formatter.js';

export class NumberCell extends BaseCellRenderer<
  number,
  number,
  NumberPropertyDataType
> {
  @query('input')
  private accessor _inputEle!: HTMLInputElement;

  private _getFormattedString(value: number | undefined = this.value) {
    const enableNewFormatting =
      this.view.featureFlags$.value.enable_number_formatting;
    const decimals = this.property.data$.value.decimal ?? 0;
    const formatMode = (this.property.data$.value.format ??
      'number') as NumberFormat;

    return value != undefined
      ? enableNewFormatting
        ? formatNumber(value, formatMode, decimals)
        : value.toString()
      : '';
  }

  private readonly _keydown = (e: KeyboardEvent) => {
    const ctrlKey = IS_MAC ? e.metaKey : e.ctrlKey;

    if (e.key.toLowerCase() === 'z' && ctrlKey) {
      e.stopPropagation();
      return;
    }

    if (e.key === 'Enter' && !e.isComposing) {
      requestAnimationFrame(() => {
        this.selectCurrentCell(false);
      });
    }
  };

  private readonly _setValue = (str: string = this._inputEle?.value) => {
    if (!str) {
      this.valueSetNextTick(undefined);
      return;
    }

    const enableNewFormatting =
      this.view.featureFlags$.value.enable_number_formatting;
    const value = enableNewFormatting ? parseNumber(str) : parseFloat(str);
    if (isNaN(value)) {
      if (this._inputEle) {
        this._inputEle.value = this.value
          ? this._getFormattedString(this.value)
          : '';
      }
      return;
    }

    if (this._inputEle) {
      this._inputEle.value = this._getFormattedString(value);
    }
    this.valueSetNextTick(value);
  };

  focusEnd = () => {
    if (!this._inputEle) return;

    const end = this._inputEle.value.length;
    this._inputEle.focus();
    this._inputEle.setSelectionRange(end, end);
  };

  _blur() {
    this.selectCurrentCell(false);
  }

  _focus() {
    if (!this.isEditing$.value) {
      this.selectCurrentCell(true);
    }
  }

  override afterEnterEditingMode() {
    this.focusEnd();
  }

  override beforeExitEditingMode() {
    this._setValue();
  }

  override render() {
    if (this.isEditing$.value) {
      const formatted = this.value ? this._getFormattedString(this.value) : '';

      return html`<input
        type="text"
        autocomplete="off"
        .value="${formatted}"
        @keydown="${this._keydown}"
        @blur="${this._blur}"
        @focus="${this._focus}"
        class="${numberInputStyle} number"
        @pointerdown="${stopPropagation}"
      />`;
    } else {
      return html` <div class="${numberStyle} number">
        ${this._getFormattedString()}
      </div>`;
    }
  }
}

export const numberPropertyConfig =
  numberPropertyModelConfig.createPropertyMeta({
    icon: createIcon('NumberIcon'),
    cellRenderer: {
      view: createFromBaseCellRenderer(NumberCell),
    },
  });
