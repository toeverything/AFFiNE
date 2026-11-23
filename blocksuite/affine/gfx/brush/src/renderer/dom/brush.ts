import {
  DomElementRendererExtension,
  type DomRenderer,
} from '@blocksuite/affine-block-surface';
import type { BrushElementModel } from '@blocksuite/affine-model';
import { DefaultTheme } from '@blocksuite/affine-model';

import { renderBrushLikeDom } from './shared';

export const BrushDomRendererExtension = DomElementRendererExtension(
  'brush',
  (
    model: BrushElementModel,
    domElement: HTMLElement,
    renderer: DomRenderer
  ) => {
    renderBrushLikeDom({
      model,
      domElement,
      renderer,
      color: renderer.getColorValue(model.color, DefaultTheme.black, true),
    });
  }
);
