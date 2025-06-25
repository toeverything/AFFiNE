import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import z from 'zod';

import { AffineCommentProvider } from './comment-provider';

const optionsSchema = z.object({
  enableComment: z.boolean().optional(),
});

export class CommentViewExtension extends ViewExtensionProvider {
  override name = 'comment';

  override schema = optionsSchema;

  override setup(
    context: ViewExtensionContext,
    options?: z.infer<typeof optionsSchema>
  ) {
    super.setup(context, options);
    if (!options?.enableComment) return;

    context.register([AffineCommentProvider]);
  }
}
