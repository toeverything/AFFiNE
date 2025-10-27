import { DividerBlockModel } from '@blocksuite/affine-model';
import { DisposableGroup } from '@blocksuite/global/disposable';
import {
  BlockSelection,
  LifeCycleWatcher,
  SurfaceSelection,
  TextSelection,
} from '@blocksuite/std';
import {
  GfxControllerIdentifier,
  type GfxModel,
  type GfxPrimitiveElementModel,
} from '@blocksuite/std/gfx';
import type { BaseSelection, BlockModel } from '@blocksuite/store';
import { signal } from '@preact/signals-core';

import { getSelectedBlocksCommand } from '../../commands';
import { ImageSelection } from '../../selection';
import { matchModels } from '../../utils';
import { type CommentId, CommentProviderIdentifier } from './comment-provider';
import { findCommentedBlocks, findCommentedElements } from './utils';

export class BlockElementCommentManager extends LifeCycleWatcher {
  static override key = 'block-element-comment-manager';

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

  isElementCommentHighlighted(element: GfxPrimitiveElementModel) {
    const comments = element.comments;
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
      provider.onCommentDeleted(id => this.handleDeleteAndResolve(id, 'delete'))
    );
    this._disposables.add(
      provider.onCommentResolved(id =>
        this.handleDeleteAndResolve(id, 'resolve')
      )
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
    // get blocks from text range that some no-text blocks are selected such as image, bookmark, etc.
    const noTextBlocksFromTextRange = selections
      .filter((s): s is TextSelection => s.is(TextSelection))
      .flatMap(s => {
        const [_, { selectedBlocks }] = this.std.command.exec(
          getSelectedBlocksCommand,
          {
            textSelection: s,
          }
        );
        if (!selectedBlocks) return [];
        return selectedBlocks.map(b => b.model).filter(m => !m.text);
      });

    const blocksFromBlockSelection = selections
      .filter(s => s instanceof BlockSelection || s instanceof ImageSelection)
      .map(({ blockId }) => this.std.store.getModelById(blockId))
      .filter(
        (m): m is BlockModel =>
          m !== null && !matchModels(m, [DividerBlockModel])
      );

    const needCommentBlocks = [
      ...noTextBlocksFromTextRange,
      ...blocksFromBlockSelection,
    ];

    if (needCommentBlocks.length !== 0) {
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
    }

    const gfx = this.std.get(GfxControllerIdentifier);
    const elementsFromSurfaceSelection = selections
      .filter(s => s instanceof SurfaceSelection)
      .flatMap(({ elements }) => {
        return elements
          .map(id => gfx.getElementById<GfxModel>(id))
          .filter(m => m !== null);
      });
    if (elementsFromSurfaceSelection.length !== 0) {
      this.std.store.withoutTransact(() => {
        elementsFromSurfaceSelection.forEach(element => {
          const comments =
            'comments' in element &&
            typeof element.comments === 'object' &&
            element.comments !== null
              ? element.comments
              : {};

          gfx.updateElement(element, {
            comments: { [id]: true, ...comments },
          });
        });
      });
    }
  };

  readonly handleDeleteAndResolve = (
    id: CommentId,
    type: 'delete' | 'resolve'
  ) => {
    const commentedBlocks = findCommentedBlocks(this.std.store, id);
    this.std.store.withoutTransact(() => {
      commentedBlocks.forEach(block => {
        if (type === 'delete') {
          delete block.props.comments[id];
        } else {
          block.props.comments[id] = false;
        }
      });
    });

    const commentedElements = findCommentedElements(this.std.store, id);
    this.std.store.withoutTransact(() => {
      commentedElements.forEach(element => {
        if (type === 'delete') {
          delete element.comments[id];
        } else {
          element.comments[id] = false;
        }
      });
    });
  };

  private readonly _handleHighlightComment = (id: CommentId | null) => {
    this._highlightedCommentId$.value = id;
  };
}
