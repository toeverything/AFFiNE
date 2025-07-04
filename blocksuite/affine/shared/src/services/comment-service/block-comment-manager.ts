import { DividerBlockModel } from '@blocksuite/affine-model';
import { DisposableGroup } from '@blocksuite/global/disposable';
import {
  BlockSelection,
  LifeCycleWatcher,
  TextSelection,
} from '@blocksuite/std';
import type { BaseSelection, BlockModel } from '@blocksuite/store';
import { signal } from '@preact/signals-core';

import { getSelectedBlocksCommand } from '../../commands';
import { ImageSelection } from '../../selection';
import { matchModels } from '../../utils';
import { type CommentId, CommentProviderIdentifier } from './comment-provider';
import { findCommentedBlocks } from './utils';

export class BlockCommentManager extends LifeCycleWatcher {
  static override key = 'block-comment-manager';

  private readonly _highlightedCommentId$ = signal<CommentId | null>(null);

  private readonly _disposables = new DisposableGroup();

  private get _provider() {
    return this.std.getOptional(CommentProviderIdentifier);
  }

  isBlockCommentHighlighted(
    block: BlockModel<{ comments?: Record<CommentId, boolean> }>
  ) {
    const comments = block.props.comments;
    if (!comments) return false;
    return (
      this._highlightedCommentId$.value !== null &&
      Object.keys(comments).includes(this._highlightedCommentId$.value)
    );
  }

  override mounted() {
    const provider = this._provider;
    if (!provider) return;

    this._disposables.add(provider.onCommentAdded(this._handleAddComment));
    this._disposables.add(
      provider.onCommentDeleted(this.handleDeleteAndResolve)
    );
    this._disposables.add(
      provider.onCommentResolved(this.handleDeleteAndResolve)
    );
    this._disposables.add(
      provider.onCommentHighlighted(this._handleHighlightComment)
    );
  }

  override unmounted() {
    this._disposables.dispose();
  }

  private readonly _handleAddComment = (
    id: CommentId,
    selections: BaseSelection[]
  ) => {
    const blocksFromTextRange = selections
      .filter((s): s is TextSelection => s.is(TextSelection))
      .map(s => {
        const [_, { selectedBlocks }] = this.std.command.exec(
          getSelectedBlocksCommand,
          {
            textSelection: s,
          }
        );
        if (!selectedBlocks) return [];
        return selectedBlocks.map(b => b.model).filter(m => !m.text);
      });

    const needCommentBlocks = [
      ...blocksFromTextRange.flat(),
      ...selections
        .filter(s => s instanceof BlockSelection || s instanceof ImageSelection)
        .map(({ blockId }) => this.std.store.getModelById(blockId))
        .filter(
          (m): m is BlockModel =>
            m !== null && !matchModels(m, [DividerBlockModel])
        ),
    ];

    if (needCommentBlocks.length === 0) return;

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

  readonly handleDeleteAndResolve = (id: CommentId) => {
    const commentedBlocks = findCommentedBlocks(this.std.store, id);
    this.std.store.withoutTransact(() => {
      commentedBlocks.forEach(block => {
        delete block.props.comments[id];
      });
    });
  };

  private readonly _handleHighlightComment = (id: CommentId | null) => {
    this._highlightedCommentId$.value = id;
  };
}
