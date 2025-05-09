import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import {
  LatexEditorUnitSpecExtension,
  LatexInlineSpecExtension,
} from './inline-spec';
import { LatexEditorInlineManagerExtension } from './latex-node/latex-editor-menu';

export class LatexViewExtension extends ViewExtensionProvider {
  override name = 'affine-latex-inline';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register([
      LatexInlineSpecExtension,
      LatexEditorUnitSpecExtension,
      LatexEditorInlineManagerExtension,
    ]);
  }
}
