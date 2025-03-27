import { AffineText } from './nodes/affine-text';

export function effects() {
  customElements.define('affine-text', AffineText);
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-text': AffineText;
  }
}
