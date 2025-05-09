import { WidgetViewExtension } from '@blocksuite/std';
import { literal, unsafeStatic } from 'lit/static-html.js';

import { AFFINE_DOC_REMOTE_SELECTION_WIDGET } from './doc';
import { AFFINE_EDGELESS_REMOTE_SELECTION_WIDGET } from './edgeless';

export * from './doc';
export * from './edgeless';

export const docRemoteSelectionWidget = WidgetViewExtension(
  'affine:page',
  AFFINE_DOC_REMOTE_SELECTION_WIDGET,
  literal`${unsafeStatic(AFFINE_DOC_REMOTE_SELECTION_WIDGET)}`
);

export const edgelessRemoteSelectionWidget = WidgetViewExtension(
  'affine:page',
  AFFINE_EDGELESS_REMOTE_SELECTION_WIDGET,
  literal`${unsafeStatic(AFFINE_EDGELESS_REMOTE_SELECTION_WIDGET)}`
);
