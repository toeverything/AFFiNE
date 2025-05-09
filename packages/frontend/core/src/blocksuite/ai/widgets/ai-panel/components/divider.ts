import { WithDisposable } from '@blocksuite/affine/global/lit';
import { css, html, LitElement } from 'lit';

export class AIPanelDivider extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      align-self: stretch;
      width: 100%;
    }
    .divider {
      height: 0.5px;
      background: var(--affine-border-color);
      width: 100%;
    }
  `;

  override render() {
    return html`<div class="divider"></div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-panel-divider': AIPanelDivider;
  }
}
