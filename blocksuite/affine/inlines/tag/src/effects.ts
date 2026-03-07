import { AffineTagInline } from './tag-node';

export function effects() {
  customElements.define('affine-tag-inline', AffineTagInline);
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-tag-inline': AffineTagInline;
  }
}
