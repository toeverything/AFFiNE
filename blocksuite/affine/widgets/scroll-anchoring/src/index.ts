import { WidgetViewExtension } from '@blocksuite/std';
import { literal, unsafeStatic } from 'lit/static-html.js';

import { AFFINE_SCROLL_ANCHORING_WIDGET } from './scroll-anchoring.js';

export * from './scroll-anchoring.js';

export const scrollAnchoringWidget = WidgetViewExtension(
  'affine:page',
  AFFINE_SCROLL_ANCHORING_WIDGET,
  literal`${unsafeStatic(AFFINE_SCROLL_ANCHORING_WIDGET)}`
);
