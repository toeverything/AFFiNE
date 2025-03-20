import {
  AFFINE_FRAME_TITLE_WIDGET,
  AffineFrameTitleWidget,
} from './affine-frame-title-widget.js';
import { EdgelessFrameTitleEditor } from './edgeless-frame-title-editor.js';
import { AFFINE_FRAME_TITLE, AffineFrameTitle } from './frame-title.js';

export function effects() {
  customElements.define(AFFINE_FRAME_TITLE_WIDGET, AffineFrameTitleWidget);
  customElements.define(AFFINE_FRAME_TITLE, AffineFrameTitle);
  customElements.define(
    'edgeless-frame-title-editor',
    EdgelessFrameTitleEditor
  );
}
