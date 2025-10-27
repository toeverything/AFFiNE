import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import { MindMapIndicatorOverlay } from './indicator-overlay';
import { MindMapDragExtension } from './interactivity';
import {
  MindmapDomRendererExtension,
  MindmapElementRendererExtension,
} from './renderer';
import {
  mindmapToolbarExtension,
  shapeMindmapToolbarExtension,
} from './toolbar/config';
import { mindMapSeniorTool } from './toolbar/senior-tool';
import { MindMapInteraction, MindMapView } from './view/view';

export class MindmapViewExtension extends ViewExtensionProvider {
  override name = 'affine-mindmap-gfx';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register(MindmapElementRendererExtension);
    context.register(MindmapDomRendererExtension);
    context.register(mindMapSeniorTool);
    context.register(mindmapToolbarExtension);
    context.register(shapeMindmapToolbarExtension);
    context.register(MindMapView);
    context.register(MindMapDragExtension);
    context.register(MindMapIndicatorOverlay);
    context.register(MindMapInteraction);
  }
}
