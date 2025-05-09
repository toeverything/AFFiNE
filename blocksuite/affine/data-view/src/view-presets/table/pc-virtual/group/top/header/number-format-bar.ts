import { WithDisposable } from '@blocksuite/global/lit';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, html, LitElement, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';

import type { Property } from '../../../../../../core/view-manager/property';
import { formatNumber } from '../../../../../../property-presets/number/utils/formatter';

const IncreaseDecimalPlacesIcon = html`
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M0 10.5H2.66176V13.5H0V10.5ZM13.3333 18H20V21H13.3333V18ZM22.6259 17.9356L24 19.5282L22.6312 21.0585L20 24V15L22.6259 17.9356ZM3.99019 4.4953C3.99019 2.01262 5.78279 0 7.98405 0C10.1898 0 11.9779 2.02109 11.9779 4.4953V9.0047C11.9779 11.4874 10.1853 13.5 7.98405 13.5C5.7783 13.5 3.99019 11.4789 3.99019 9.0047V4.4953ZM6 4.49786V9.00214C6 10.2525 6.89543 11.25 8 11.25C9.11227 11.25 10 10.2436 10 9.00214V4.49786C10 3.24754 9.10457 2.25 8 2.25C6.88773 2.25 6 3.2564 6 4.49786ZM13.3235 4.4953C13.3235 2.01262 15.1161 0 17.3174 0C19.5231 0 21.3113 2.02109 21.3113 4.4953V9.0047C21.3113 11.4874 19.5187 13.5 17.3174 13.5C15.1116 13.5 13.3235 11.4789 13.3235 9.0047V4.4953ZM15.3333 4.49786V9.00214C15.3333 10.2525 16.2288 11.25 17.3333 11.25C18.4456 11.25 19.3333 10.2436 19.3333 9.00214V4.49786C19.3333 3.24754 18.4379 2.25 17.3333 2.25C16.2211 2.25 15.3333 3.2564 15.3333 4.49786Z"
      fill="currentColor"
    />
  </svg>
`;

const DecreaseDecimalPlacesIcon = html`
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M0 10.5H3V13.5H0V10.5ZM18.09 22.41L16.305 20.625H24V18.375H16.305L18.09 16.59L16.5 15L12 19.5L16.5 24L18.09 22.41ZM13.5 9.375V4.125C13.5 1.845 11.655 0 9.375 0C7.095 0 5.25 1.845 5.25 4.125V9.375C5.25 11.655 7.095 13.5 9.375 13.5C11.655 13.5 13.5 11.655 13.5 9.375ZM11.25 9.375C11.25 10.41 10.41 11.25 9.375 11.25C8.34 11.25 7.5 10.41 7.5 9.375V4.125C7.5 3.09 8.34 2.25 9.375 2.25C10.41 2.25 11.25 3.09 11.25 4.125V9.375Z"
      fill="currentColor"
    />
  </svg>
`;

export class DatabaseNumberFormatBar extends WithDisposable(LitElement) {
  static override styles = css`
    .number-format-toolbar-container {
      padding: 4px 12px;
      display: flex;
      gap: 7px;
      flex-direction: column;
    }

    .number-format-decimal-places {
      display: flex;
      gap: 4px;
      align-items: center;
      justify-content: flex-start;
    }

    .number-format-toolbar-button {
      box-sizing: border-box;
      background-color: transparent;
      border: none;
      border-radius: 4px;
      color: var(--affine-icon-color);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px;
      position: relative;

      user-select: none;
    }

    .number-format-toolbar-button svg {
      width: 16px;
      height: 16px;
    }

    .number-formatting-sample {
      font-size: var(--affine-font-xs);
      color: var(--affine-icon-color);
      margin-left: auto;
    }
    .number-format-toolbar-button:hover {
      background-color: var(--affine-hover-color);
    }
    .divider {
      width: 100%;
      height: 1px;
      background-color: ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
    }
  `;

  private readonly _decrementDecimalPlaces = () => {
    this.column.dataUpdate(data => ({
      decimal: Math.max(((data.decimal as number) ?? 0) - 1, 0),
    }));
    this.requestUpdate();
  };

  private readonly _incrementDecimalPlaces = () => {
    this.column.dataUpdate(data => ({
      decimal: Math.min(((data.decimal as number) ?? 0) + 1, 8),
    }));
    this.requestUpdate();
  };

  override render() {
    return html`
      <div class="number-format-toolbar-container">
        <div class="number-format-decimal-places">
          <button
            class="number-format-toolbar-button"
            aria-label="decrease decimal places"
            @click=${this._decrementDecimalPlaces}
          >
            ${DecreaseDecimalPlacesIcon}
          </button>

          <button
            class="number-format-toolbar-button"
            aria-label="increase decimal places"
            @click=${this._incrementDecimalPlaces}
          >
            ${IncreaseDecimalPlacesIcon}
          </button>
          <span class="number-formatting-sample">
            <span class="number-formatting-sample">
              &lpar;&nbsp;${formatNumber(
                1,
                'number',
                (this.column.data$.value?.decimal as number) ?? 0
              )}&nbsp;&rpar;
            </span>
          </span>
        </div>
        <div class="divider"></div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor column!: Property;
}

declare global {
  interface HTMLElementTagNameMap {
    'virtual-database-number-format-bar': DatabaseNumberFormatBar;
  }
}
