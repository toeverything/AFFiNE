import { panelBaseStyle } from '@blocksuite/affine-shared/styles';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import { css, html, LitElement } from 'lit';

export class EditorToolbar extends WithDisposable(LitElement) {
  static override styles = css`
    ${panelBaseStyle(':host')}
    :host {
      height: 36px;
      box-sizing: content-box;
    }

    :host([data-without-bg]) {
      border-color: transparent;
      background: transparent;
      box-shadow: none;
    }

    ::slotted(*) {
      display: flex;
      height: 100%;
      justify-content: center;
      align-items: center;
      gap: 8px;
      color: var(--affine-text-primary-color);
      fill: currentColor;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();

    this._disposables.addFromEvent(this, 'pointerdown', (e: PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
    });
    this._disposables.addFromEvent(this, 'wheel', stopPropagation, {
      passive: false,
    });
  }

  override render() {
    return html`<slot></slot>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'editor-toolbar': EditorToolbar;
  }
}
