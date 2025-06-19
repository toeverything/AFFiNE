import {
  EDGELESS_DRAGGING_AREA_WIDGET,
  EdgelessDraggingAreaRectWidget,
} from './edgeless-dragging-area-rect';
import {
  EDGELESS_LASSO_DRAGGING_AREA_WIDGET,
  EdgelessLassoDraggingAreaWidget,
} from './edgeless-lasso-dragging-area';

export function effects() {
  customElements.define(
    EDGELESS_DRAGGING_AREA_WIDGET,
    EdgelessDraggingAreaRectWidget
  );
  customElements.define(
    EDGELESS_LASSO_DRAGGING_AREA_WIDGET,
    EdgelessLassoDraggingAreaWidget
  );
}
