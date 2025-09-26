import { CalloutBlockComponent } from './callout-block';

export function effects() {
  customElements.define('affine-callout', CalloutBlockComponent);
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-callout': CalloutBlockComponent;
  }
}
