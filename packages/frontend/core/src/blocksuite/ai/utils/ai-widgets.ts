import type { EditorHost } from '@blocksuite/affine/std';

import {
  AFFINE_AI_PANEL_WIDGET,
  AffineAIPanelWidget,
} from '../widgets/ai-panel/ai-panel';

export const getAIPanelWidget = (host: EditorHost): AffineAIPanelWidget => {
  const rootBlockId = host.store.root?.id;
  if (!rootBlockId) {
    throw new Error('rootBlockId is not found');
  }
  const aiPanel = host.view.getWidget(AFFINE_AI_PANEL_WIDGET, rootBlockId);
  if (!(aiPanel instanceof AffineAIPanelWidget)) {
    throw new Error('AI panel not found');
  }
  return aiPanel;
};
