import { CommentIcon } from '@blocksuite/icons/lit';
import { BlockSelection } from '@blocksuite/std';
import type { BlockModel, Store } from '@blocksuite/store';

import type { ToolbarAction } from '../toolbar-service';
import { type CommentId, CommentProviderIdentifier } from './comment-provider';

export function findAllCommentedBlocks(store: Store) {
  type CommentedBlock = BlockModel<{ comments: Record<CommentId, boolean> }>;
  return store.getAllModels().filter((block): block is CommentedBlock => {
    return (
      'comments' in block.props &&
      typeof block.props.comments === 'object' &&
      block.props.comments !== null
    );
  });
}

export function findCommentedBlocks(store: Store, commentId: CommentId) {
  return findAllCommentedBlocks(store).filter(block => {
    return block.props.comments[commentId];
  });
}

export const blockCommentToolbarButton: Omit<ToolbarAction, 'id'> = {
  tooltip: 'Comment',
  when: ({ std }) => !!std.getOptional(CommentProviderIdentifier),
  icon: CommentIcon(),
  run: ctx => {
    const commentProvider = ctx.std.getOptional(CommentProviderIdentifier);
    if (!commentProvider) return;
    const selections = ctx.selection.value;

    const model = ctx.getCurrentModel();

    if (selections.length > 1) {
      commentProvider.addComment(selections);
    } else if (model) {
      commentProvider.addComment([
        new BlockSelection({
          blockId: model.id,
        }),
      ]);
    } else if (selections.length === 1) {
      commentProvider.addComment(selections);
    } else {
      return;
    }
  },
};
