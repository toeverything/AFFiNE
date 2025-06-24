import { DomElementRendererExtension } from '@blocksuite/affine-block-surface';

import { connectorDomRenderer } from './connector-dom/index.js';

/**
 * Extension to register the DOM-based renderer for 'connector' elements.
 */
export const ConnectorDomRendererExtension = DomElementRendererExtension(
  'connector',
  connectorDomRenderer
);
