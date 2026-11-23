import { WidgetViewExtension } from '@blocksuite/std';
import { literal, unsafeStatic } from 'lit/static-html.js';

import { AFFINE_TOOLBAR_WIDGET } from './toolbar';

export * from './toolbar';

export const toolbarWidget = WidgetViewExtension(
  'affine:page',
  AFFINE_TOOLBAR_WIDGET,
  literal`${unsafeStatic(AFFINE_TOOLBAR_WIDGET)}`
);
