import { CheckBoxCheckSolidIcon, CheckBoxUnIcon } from '@blocksuite/icons/lit';
import { html } from 'lit';

import { BaseCellRenderer } from '../../core/property/index.js';
import { createFromBaseCellRenderer } from '../../core/property/renderer.js';
import { createIcon } from '../../core/utils/uni-icon.js';
import {
  formulaCellStyle,
  formulaCheckboxStyle,
  formulaErrorStyle,
  formulaNumberStyle,
} from './cell-renderer-css.js';
import {
  type FormulaCellValue,
  FormulaErrorValue,
  type FormulaPropertyData,
} from './cell-value.js';
import { formulaPropertyModelConfig } from './define.js';
import { valueToText } from './engine/index.js';

export class FormulaCell extends BaseCellRenderer<
  FormulaCellValue,
  unknown,
  FormulaPropertyData
> {
  override beforeEnterEditMode() {
    return false;
  }

  private renderValue(value: FormulaCellValue | undefined) {
    if (value == null) return null;
    if (value instanceof FormulaErrorValue) {
      return html`<span class="${formulaErrorStyle}" title="${value.message}"
        >Error</span
      >`;
    }
    if (typeof value === 'boolean') {
      return html`<span class="${formulaCheckboxStyle}"
        >${
          value
            ? CheckBoxCheckSolidIcon({ style: `color:#1E96EB` })
            : CheckBoxUnIcon()
        }</span
      >`;
    }
    return valueToText(value);
  }

  override render() {
    const value = this.value;
    const classes =
      typeof value === 'number'
        ? `${formulaCellStyle} ${formulaNumberStyle}`
        : formulaCellStyle;
    return html`<div class="${classes} formula">
      ${this.renderValue(value)}
    </div>`;
  }
}

export const formulaPropertyConfig =
  formulaPropertyModelConfig.createPropertyMeta({
    icon: createIcon('MathPanelIcon'),
    cellRenderer: {
      view: createFromBaseCellRenderer(FormulaCell),
    },
  });
