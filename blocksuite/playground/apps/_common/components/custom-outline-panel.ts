import { WithDisposable } from '@blocksuite/affine/global/lit';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { TestAffineEditorContainer } from '@blocksuite/integration-test';
import { css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('custom-outline-panel')
export class CustomOutlinePanel extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .custom-outline-container {
      position: absolute;
      top: 0;
      right: 16px;
      border: 1px solid var(--affine-border-color, #e3e2e4);
      background: var(--affine-background-overlay-panel-color);
      height: 100vh;
      width: 320px;
      box-sizing: border-box;
      z-index: 1;
    }
  `;

  private _renderPanel() {
    return html`<affine-outline-panel
      .editor=${this.editor.host}
      .fitPadding=${[50, 360, 50, 50]}
    ></affine-outline-panel>`;
  }

  override render() {
    return html`
      ${this._show
        ? html`
            <div class="custom-outline-container">${this._renderPanel()}</div>
          `
        : nothing}
    `;
  }

  toggleDisplay() {
    this._show = !this._show;
  }

  @state()
  private accessor _show = false;

  @property({ attribute: false })
  accessor editor!: TestAffineEditorContainer;
}

declare global {
  interface HTMLElementTagNameMap {
    'custom-outline-panel': CustomOutlinePanel;
  }
}
