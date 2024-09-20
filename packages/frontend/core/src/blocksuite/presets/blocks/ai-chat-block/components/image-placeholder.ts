import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, type TemplateResult, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';

export class ImagePlaceholder extends LitElement {
  static override styles = css`
    .placeholder-container {
      display: flex;
      width: 100%;
      height: 122px;
      padding: 12px;
      align-items: flex-start;
      border-radius: 8px;
      border: 1px solid var(--affine-background-tertiary-color);
      background: var(--affine-background-secondary-color);
      box-sizing: border-box;
    }

    .placeholder-title {
      display: flex;
      gap: 8px;
      align-items: center;
      color: var(--affine-placeholder-color, #c0bfc1);
      text-align: justify;
      /* light/smBold */
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
      font-size: var(--affine-font-sm);
      font-style: normal;
      font-weight: 600;
      line-height: 22px; /* 157.143% */
      height: 22px;
    }

    .placeholder-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--affine-icon-color);
    }
  `;

  override render() {
    return html`<div class="placeholder-container">
      <div class="placeholder-title">
        <span class="placeholder-icon">${this.icon}</span>
        <span>${this.text}</span>
      </div>
    </div>`;
  }

  @property({ attribute: false })
  accessor icon!: TemplateResult<1>;

  @property({ attribute: false })
  accessor text!: string;
}

declare global {
  interface HTMLElementTagNameMap {
    'image-placeholder': ImagePlaceholder;
  }
}
