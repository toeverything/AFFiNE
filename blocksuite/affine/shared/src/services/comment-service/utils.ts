import { CommentIcon } from '@blocksuite/icons/lit';
import { BlockSelection } from '@blocksuite/std';
import type { BlockModel, Store } from '@blocksuite/store';

import type { ToolbarAction } from '../toolbar-service';
import { type CommentId, CommentProviderIdentifier } from './comment-provider';

export function findCommentedBlocks(store: Store, commentId: CommentId) {
  type CommentedBlock = BlockModel<{ comments: Record<CommentId, boolean> }>;
  return store.getAllModels().filter((block): block is CommentedBlock => {
    return (
      'comments' in block.props &&
      typeof block.props.comments === 'object' &&
      block.props.comments !== null &&
      commentId in block.props.comments
    );
  });
}

export const blockCommentToolbarButton: Omit<ToolbarAction, 'id'> = {
  tooltip: 'Comment',
  when: ({ std }) => !!std.getOptional(CommentProviderIdentifier),
  icon: CommentIcon(),
  run: ctx => {
    const commentProvider = ctx.std.getOptional(CommentProviderIdentifier);
    const model = ctx.getCurrentModel();
    if (!commentProvider || !model) return;

    commentProvider.addComment([
      new BlockSelection({
        blockId: model.id,
      }),
    ]);
  },
};
