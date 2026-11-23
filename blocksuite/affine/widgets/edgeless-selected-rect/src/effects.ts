import { EdgelessAutoCompletePanel } from './auto-complete-panel';
import { EdgelessAutoComplete } from './edgeless-auto-complete';
import {
  EDGELESS_SELECTED_RECT_WIDGET,
  EdgelessSelectedRectWidget,
} from './edgeless-selected-rect';

export function effects() {
  customElements.define(
    'edgeless-auto-complete-panel',
    EdgelessAutoCompletePanel
  );
  customElements.define('edgeless-auto-complete', EdgelessAutoComplete);
  customElements.define(
    EDGELESS_SELECTED_RECT_WIDGET,
    EdgelessSelectedRectWidget
  );
}
