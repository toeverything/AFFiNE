import type { Store } from '@blocksuite/store';

import type { CommentId } from './comment-provider';

export function findCommentedBlocks(store: Store, commentId: CommentId) {
  return store.getAllModels().filter(block => {
    return 'comment' in block.props && block.props.comment === commentId;
  });
}
