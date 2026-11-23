import { AFFINE_TOOLBAR_WIDGET, AffineToolbarWidget } from './toolbar';

export function effects() {
  customElements.define(AFFINE_TOOLBAR_WIDGET, AffineToolbarWidget);
}

declare global {
  interface HTMLElementTagNameMap {
    [AFFINE_TOOLBAR_WIDGET]: AffineToolbarWidget;
  }
}
