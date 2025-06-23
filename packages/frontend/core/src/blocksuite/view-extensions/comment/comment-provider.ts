import { noop } from '@blocksuite/affine/global/utils';
import { CommentProviderExtension } from '@blocksuite/affine/shared/services';

export const AffineCommentProvider = CommentProviderExtension({
  addComment: noop,
  resolveComment: noop,
  highlightComment: noop,
  getComments: () => [],

  onCommentAdded: () => noop,
  onCommentResolved: () => noop,
  onCommentDeleted: () => noop,
  onCommentHighlighted: () => noop,
});
