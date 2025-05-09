import { ListBlockComponent } from './list-block.js';

export function effects() {
  customElements.define('affine-list', ListBlockComponent);
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-list': ListBlockComponent;
  }
}
