import {
  AFFINE_PAGE_DRAGGING_AREA_WIDGET,
  AffinePageDraggingAreaWidget,
} from './index';

export function effects() {
  customElements.define(
    AFFINE_PAGE_DRAGGING_AREA_WIDGET,
    AffinePageDraggingAreaWidget
  );
}
