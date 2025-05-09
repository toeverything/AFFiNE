import { AffineMention } from './affine-mention';

export function effects() {
  customElements.define('affine-mention', AffineMention);
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-mention': AffineMention;
  }
}
