import { DisposableGroup } from '@blocksuite/global/disposable';
import { BlockSelection, LifeCycleWatcher } from '@blocksuite/std';
import type { BaseSelection } from '@blocksuite/store';

import { type CommentId, CommentProviderIdentifier } from './comment-provider';
import { findCommentedBlocks } from './utils';

export class BlockCommentManager extends LifeCycleWatcher {
  static override key = 'block-comment-manager';

  private readonly _disposables = new DisposableGroup();

  private get _provider() {
    return this.std.getOptional(CommentProviderIdentifier);
  }

  override mounted() {
    const provider = this._provider;
    if (!provider) return;

    this._disposables.add(provider.onCommentAdded(this._handleAddComment));
    this._disposables.add(
      provider.onCommentDeleted(this._handleDeleteAndResolve)
    );
    this._disposables.add(
      provider.onCommentResolved(this._handleDeleteAndResolve)
    );
  }

  override unmounted() {
    this._disposables.dispose();
  }

  private readonly _handleAddComment = (
    id: CommentId,
    selections: BaseSelection[]
  ) => {
    const needCommentBlocks = selections
      .filter((s): s is BlockSelection => s.is(BlockSelection))
      .map(({ blockId }) => this.std.store.getModelById(blockId))
      .filter(m => m !== null);

    this.std.store.withoutTransact(() => {
      needCommentBlocks.forEach(block => {
        const comments = (
          'comments' in block.props &&
          typeof block.props.comments === 'object' &&
          block.props.comments !== null
            ? block.props.comments
            : {}
        ) as Record<CommentId, boolean>;

        this.std.store.updateBlock(block, {
          comments: { [id]: true, ...comments },
        });
      });
    });
  };

  private readonly _handleDeleteAndResolve = (id: CommentId) => {
    const commentedBlocks = findCommentedBlocks(this.std.store, id);
    this.std.store.withoutTransact(() => {
      commentedBlocks.forEach(block => {
        delete block.props.comments[id];
      });
    });
  };
}
