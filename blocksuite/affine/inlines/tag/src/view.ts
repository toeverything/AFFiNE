import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import { TagInlineSpecExtension } from './inline-spec';

export class TagViewExtension extends ViewExtensionProvider {
  override name = 'affine-tag-inline';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register(TagInlineSpecExtension);
  }
}
