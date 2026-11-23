import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { FrameworkProvider } from '@toeverything/infra';
import z from 'zod';

import { AffineCommentProvider } from './comment-provider';

const optionsSchema = z.object({
  enableComment: z.boolean().optional(),
  framework: z.instanceof(FrameworkProvider).optional(),
});

type CommentViewOptions = z.infer<typeof optionsSchema>;

export class CommentViewExtension extends ViewExtensionProvider<CommentViewOptions> {
  override name = 'comment';

  override schema = optionsSchema;

  override setup(context: ViewExtensionContext, options?: CommentViewOptions) {
    super.setup(context, options);
    if (!options?.enableComment) return;

    const framework = options.framework;
    if (!framework) return;

    context.register([AffineCommentProvider(framework)]);
  }
}
