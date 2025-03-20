import type { AFFINE_DRAG_HANDLE_WIDGET } from '@blocksuite/affine-widget-drag-handle';
import type { AFFINE_FRAME_TITLE_WIDGET } from '@blocksuite/affine-widget-frame-title';
import type {
  AFFINE_DOC_REMOTE_SELECTION_WIDGET,
  AFFINE_EDGELESS_REMOTE_SELECTION_WIDGET,
} from '@blocksuite/affine-widget-remote-selection';
import type { AFFINE_SLASH_MENU_WIDGET } from '@blocksuite/affine-widget-slash-menu';

import type { EdgelessRootBlockComponent } from './edgeless/edgeless-root-block.js';
import type { PageRootBlockComponent } from './page/page-root-block.js';
import type { AFFINE_EDGELESS_ZOOM_TOOLBAR_WIDGET } from './widgets/edgeless-zoom-toolbar/index.js';
import type { AFFINE_KEYBOARD_TOOLBAR_WIDGET } from './widgets/index.js';
import type { AFFINE_INNER_MODAL_WIDGET } from './widgets/inner-modal/inner-modal.js';
import type { AFFINE_LINKED_DOC_WIDGET } from './widgets/linked-doc/config.js';
import type { AFFINE_MODAL_WIDGET } from './widgets/modal/modal.js';
import type { AFFINE_PAGE_DRAGGING_AREA_WIDGET } from './widgets/page-dragging-area/page-dragging-area.js';
import type { AFFINE_VIEWPORT_OVERLAY_WIDGET } from './widgets/viewport-overlay/viewport-overlay.js';

export type PageRootBlockWidgetName =
  | typeof AFFINE_KEYBOARD_TOOLBAR_WIDGET
  | typeof AFFINE_MODAL_WIDGET
  | typeof AFFINE_INNER_MODAL_WIDGET
  | typeof AFFINE_SLASH_MENU_WIDGET
  | typeof AFFINE_LINKED_DOC_WIDGET
  | typeof AFFINE_PAGE_DRAGGING_AREA_WIDGET
  | typeof AFFINE_DRAG_HANDLE_WIDGET
  | typeof AFFINE_DOC_REMOTE_SELECTION_WIDGET
  | typeof AFFINE_VIEWPORT_OVERLAY_WIDGET;

export type EdgelessRootBlockWidgetName =
  | typeof AFFINE_MODAL_WIDGET
  | typeof AFFINE_INNER_MODAL_WIDGET
  | typeof AFFINE_SLASH_MENU_WIDGET
  | typeof AFFINE_LINKED_DOC_WIDGET
  | typeof AFFINE_DRAG_HANDLE_WIDGET
  | typeof AFFINE_DOC_REMOTE_SELECTION_WIDGET
  | typeof AFFINE_EDGELESS_REMOTE_SELECTION_WIDGET
  | typeof AFFINE_EDGELESS_ZOOM_TOOLBAR_WIDGET
  | typeof AFFINE_VIEWPORT_OVERLAY_WIDGET
  | typeof AFFINE_FRAME_TITLE_WIDGET;

export type RootBlockComponent =
  | PageRootBlockComponent
  | EdgelessRootBlockComponent;
