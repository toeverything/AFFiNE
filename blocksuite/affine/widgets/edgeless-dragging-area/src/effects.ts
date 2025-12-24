import {
  EDGELESS_DRAGGING_AREA_WIDGET,
  EdgelessDraggingAreaRectWidget,
} from './edgeless-dragging-area-rect';

export function effects() {
  customElements.define(
    EDGELESS_DRAGGING_AREA_WIDGET,
    EdgelessDraggingAreaRectWidget
  );
}
