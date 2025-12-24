import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { TransformerMiddleware } from '@blocksuite/affine/store';
import type { TestAffineEditorContainer } from '@blocksuite/integration-test';
import { css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('custom-adapter-panel')
export class CustomAdapterPanel extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .custom-adapter-container {
      position: absolute;
      top: 0;
      right: 16px;
      border: 1px solid var(--affine-border-color, #e3e2e4);
      background: var(--affine-background-overlay-panel-color);
      height: 100vh;
      width: 30vw;
      box-sizing: border-box;
      z-index: 1;
    }
  `;

  private _renderPanel() {
    return html`<affine-adapter-panel
      .store=${this.editor.doc}
      .transformerMiddlewares=${this.transformerMiddlewares}
    ></affine-adapter-panel>`;
  }

  override render() {
    return html`
      ${this._show
        ? html`
            <div class="custom-adapter-container">${this._renderPanel()}</div>
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

  @property({ attribute: false })
  accessor transformerMiddlewares: TransformerMiddleware[] = [];
}

declare global {
  interface HTMLElementTagNameMap {
    'custom-adapter-panel': CustomAdapterPanel;
  }
}
