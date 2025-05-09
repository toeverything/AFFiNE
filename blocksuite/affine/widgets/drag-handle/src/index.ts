import { WidgetViewExtension } from '@blocksuite/std';
import { literal, unsafeStatic } from 'lit/static-html.js';

import { AFFINE_DRAG_HANDLE_WIDGET } from './consts';

export * from './consts';
export * from './drag-handle';
export * from './utils';
export type { DragBlockPayload } from './watchers/drag-event-watcher';

export const dragHandleWidget = WidgetViewExtension(
  'affine:page',
  AFFINE_DRAG_HANDLE_WIDGET,
  literal`${unsafeStatic(AFFINE_DRAG_HANDLE_WIDGET)}`
);
