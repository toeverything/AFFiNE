import { WidgetViewExtension } from '@blocksuite/std';
import { literal, unsafeStatic } from 'lit/static-html.js';

import { EDGELESS_SELECTED_RECT_WIDGET } from './edgeless-selected-rect';

export const edgelessSelectedRectWidget = WidgetViewExtension(
  'affine:page',
  EDGELESS_SELECTED_RECT_WIDGET,
  literal`${unsafeStatic(EDGELESS_SELECTED_RECT_WIDGET)}`
);
