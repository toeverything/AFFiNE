import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { BrushTool } from './brush-tool';
import { effects } from './effects';
import { BrushElementRendererExtension } from './element-renderer';
import { EraserTool } from './eraser-tool';
import { HighlighterTool } from './highlighter-tool';
import {
  brushToolbarExtension,
  highlighterToolbarExtension,
} from './toolbar/configs';
import { penSeniorTool } from './toolbar/senior-tool';

export class BrushViewExtension extends ViewExtensionProvider {
  override name = 'affine-brush-gfx';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);

    context.register(BrushTool);
    context.register(EraserTool);
    context.register(HighlighterTool);

    context.register(BrushElementRendererExtension);

    context.register(brushToolbarExtension);
    context.register(highlighterToolbarExtension);

    context.register(penSeniorTool);
  }
}
