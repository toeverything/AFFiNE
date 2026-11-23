import { AffineAddBlockWidget } from './components/add-block-widget';
import {
  EDGELESS_DND_PREVIEW_ELEMENT,
  EdgelessDndPreviewElement,
} from './components/edgeless-preview/preview';
import { AFFINE_ADD_BLOCK_WIDGET, AFFINE_DRAG_HANDLE_WIDGET } from './consts';
import { AffineDragHandleWidget } from './drag-handle';

export function effects() {
  customElements.define(AFFINE_DRAG_HANDLE_WIDGET, AffineDragHandleWidget);
  customElements.define(AFFINE_ADD_BLOCK_WIDGET, AffineAddBlockWidget);
  customElements.define(
    EDGELESS_DND_PREVIEW_ELEMENT,
    EdgelessDndPreviewElement
  );
}
