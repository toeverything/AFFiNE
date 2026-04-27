import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

import type { AFFINE_ADD_BLOCK_WIDGET } from '../consts.js';

export class AffineAddBlockWidget extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }

    .affine-add-block-widget {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      margin-top: 8px;
      cursor: pointer;
      border-radius: 4px;
      color: var(--affine-placeholder-color);
      background: transparent;
      border: none;
      padding: 0;
      transition:
        color 0.2s ease,
        background 0.2s ease;
      pointer-events: auto;
      user-select: none;
      box-sizing: border-box;
    }

    .affine-add-block-widget:hover {
      background: var(--affine-hover-color);
      color: var(--affine-text-primary-color);
    }

    .affine-add-block-widget svg {
      width: 12px;
      height: 12px;
      flex-shrink: 0;
    }
  `;

  @property({ type: Boolean })
  accessor visible = false;

  private readonly _handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    this.dispatchEvent(
      new CustomEvent('add-block', { bubbles: true, composed: true })
    );
  };

  override render() {
    if (!this.visible) return html``;

    return html`
      <button
        class="affine-add-block-widget"
        title="Click to add a block below"
        aria-label="Add block below"
        @click=${this._handleClick}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 12 12"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            d="M6 1a.75.75 0 0 1 .75.75v3.5h3.5a.75.75 0 0 1 0 1.5h-3.5v3.5a.75.75 0 0 1-1.5 0v-3.5h-3.5a.75.75 0 0 1 0-1.5h3.5v-3.5A.75.75 0 0 1 6 1Z"
          />
        </svg>
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_ADD_BLOCK_WIDGET]: AffineAddBlockWidget;
  }
}
