import { WithDisposable } from '@blocksuite/affine/global/lit';
import type { TestAffineEditorContainer } from '@blocksuite/integration-test';
import { css, html, LitElement, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('custom-outline-viewer')
export class CustomOutlineViewer extends WithDisposable(LitElement) {
  static override styles = css`
    .outline-viewer-container {
      position: fixed;
      display: flex;
      top: 256px;
      right: 22px;
      max-height: calc(100vh - 256px - 76px); // top(256px) and bottom(76px)
    }
  `;

  private _renderViewer() {
    return html`<affine-outline-viewer
      .editor=${this.editor.host}
      .toggleOutlinePanel=${this.toggleOutlinePanel}
    ></affine-outline-viewer>`;
  }

  override render() {
    if (!this._show || this.editor.mode === 'edgeless') return nothing;

    return html`<div class="outline-viewer-container">
      ${this._renderViewer()}
    </div>`;
  }

  toggleDisplay() {
    this._show = !this._show;
  }

  @state()
  private accessor _show = false;

  @property({ attribute: false })
  accessor editor!: TestAffineEditorContainer;

  @property({ attribute: false })
  accessor toggleOutlinePanel: (() => void) | null = null;
}

declare global {
  interface HTMLElementTagNameMap {
    'custom-outline-viewer': CustomOutlineViewer;
  }
}
