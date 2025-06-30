import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import { InlineCommentManager } from './inline-comment-manager';
import { CommentInlineSpecExtension } from './inline-spec';

export class InlineCommentViewExtension extends ViewExtensionProvider {
  override name = 'affine-inline-comment';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register([CommentInlineSpecExtension, InlineCommentManager]);
  }
}
