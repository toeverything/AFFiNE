import { AffineReference, ReferencePopup } from './reference-node';

export function effects() {
  customElements.define('reference-popup', ReferencePopup);
  customElements.define('affine-reference', AffineReference);
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-reference': AffineReference;
    'reference-popup': ReferencePopup;
  }
}
