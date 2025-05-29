import { DomElementRendererExtension } from '@blocksuite/affine-block-surface';

import { brushDomRenderer } from './brush-dom/index.js';

/**
 * Extension to register the DOM-based renderer for 'brush' elements.
 */
export const BrushDomRendererExtension = DomElementRendererExtension(
  'brush',
  brushDomRenderer
);
