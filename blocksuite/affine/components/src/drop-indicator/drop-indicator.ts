import { type Rect } from '@blocksuite/global/gfx';
import { css, html, LitElement } from 'lit';
import { property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

export class DropIndicator extends LitElement {
  static override styles = css`
    .affine-drop-indicator {
      position: absolute;
      top: 0;
      left: 0;
      background: var(--affine-primary-color);
      transition-property: height, transform;
      transition-duration: 100ms;
      transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
      transition-delay: 0s;
      transform-origin: 0 0;
      pointer-events: none;
      z-index: 2;
    }
  `;

  override render() {
    if (!this.rect) {
      return null;
    }

    const { left, top, width, height } = this.rect;
    const style = styleMap({
      width: `${width}px`,
      height: `${height}px`,
      top: `${top}px`,
      left: `${left}px`,
      zIndex: this.zIndex,
    });

    return html`<div class="affine-drop-indicator" style=${style}></div>`;
  }

  @property({ attribute: false })
  accessor rect: Rect | null = null;

  @state()
  accessor zIndex = 2;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-drop-indicator': DropIndicator;
  }
}
