import { DomElementRendererExtension } from '@blocksuite/affine-block-surface';

import { shapeDomRenderer } from './shape-dom/index.js';

/**
 * Extension to register the DOM-based renderer for 'shape' elements.
 */
export const ShapeDomRendererExtension = DomElementRendererExtension(
  'shape',
  shapeDomRenderer
);
