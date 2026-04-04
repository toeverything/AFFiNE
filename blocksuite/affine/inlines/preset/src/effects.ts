import { AffinePageHashtag } from './nodes/affine-page-hashtag';
import { AffineText } from './nodes/affine-text';

export function effects() {
  customElements.define('affine-page-hashtag', AffinePageHashtag);
  customElements.define('affine-text', AffineText);
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-page-hashtag': AffinePageHashtag;
    'affine-text': AffineText;
  }
}
