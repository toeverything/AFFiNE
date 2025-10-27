import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import z from 'zod';

import { effects } from './effects';
import { InlineCommentManager } from './inline-comment-manager';
import {
  CommentInlineSpecExtension,
  NullCommentInlineSpecExtension,
} from './inline-spec';

const optionsSchema = z.object({
  enabled: z.boolean().optional().default(true),
});

export class InlineCommentViewExtension extends ViewExtensionProvider<
  z.infer<typeof optionsSchema>
> {
  override name = 'affine-inline-comment';

  override schema = optionsSchema;

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(
    context: ViewExtensionContext,
    options?: z.infer<typeof optionsSchema>
  ) {
    super.setup(context, options);
    context.register([
      options?.enabled
        ? CommentInlineSpecExtension
        : NullCommentInlineSpecExtension,
      InlineCommentManager,
    ]);
  }
}
