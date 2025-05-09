import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { baseTheme } from '@toeverything/theme';
import {
  css,
  html,
  LitElement,
  nothing,
  type TemplateResult,
  unsafeCSS,
} from 'lit';
import { property } from 'lit/decorators.js';

export class FootNotePopupChip extends LitElement {
  static override styles = css`
    .popup-chip-container {
      display: flex;
      height: 22px;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
    }

    .prefix-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 16px;
      width: 16px;
      color: ${unsafeCSSVarV2('icon/primary')};
      border-radius: 4px;

      svg,
      img {
        width: 16px;
        height: 16px;
        fill: ${unsafeCSSVarV2('icon/primary')};
      }
    }

    .popup-chip-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
      height: 22px;
      line-height: 22px;
      color: ${unsafeCSSVarV2('text/primary')};
      font-size: var(--affine-font-sm);
      font-weight: 500;
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
    }
  `;

  override render() {
    return html`
      <div class="popup-chip-container">
        ${this.prefixIcon
          ? html`<div class="prefix-icon">${this.prefixIcon}</div>`
          : nothing}
        <div class="popup-chip-label" title=${this.tooltip}>${this.label}</div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor prefixIcon: TemplateResult | undefined = undefined;

  @property({ attribute: false })
  accessor label: string = '';

  @property({ attribute: false })
  accessor tooltip: string = '';
}
