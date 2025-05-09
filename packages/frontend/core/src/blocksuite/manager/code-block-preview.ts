import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';

import {
  CodeBlockHtmlPreview,
  effects as htmlPreviewEffects,
} from '../extensions/code-block-preview/html-preview';

export class CodeBlockPreviewExtensionProvider extends ViewExtensionProvider {
  override name = 'code-block-preview';

  override effect() {
    super.effect();

    if (window.crossOriginIsolated) {
      htmlPreviewEffects();
    }
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);

    if (window.crossOriginIsolated) {
      context.register(CodeBlockHtmlPreview);
    }
  }
}
