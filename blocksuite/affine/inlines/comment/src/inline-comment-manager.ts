import { getInlineEditorByModel } from '@blocksuite/affine-rich-text';
import { getSelectedBlocksCommand } from '@blocksuite/affine-shared/commands';
import {
  BlockCommentManager,
  type CommentId,
  CommentProviderIdentifier,
  findAllCommentedBlocks,
} from '@blocksuite/affine-shared/services';
import type { AffineInlineEditor } from '@blocksuite/affine-shared/types';
import { DisposableGroup } from '@blocksuite/global/disposable';
import {
  LifeCycleWatcher,
  type TextRangePoint,
  TextSelection,
} from '@blocksuite/std';
import type { BaseSelection, BlockModel } from '@blocksuite/store';
import { signal } from '@preact/signals-core';
import difference from 'lodash-es/difference';

import {
  extractCommentIdFromDelta,
  findAllCommentedTexts,
  findCommentedTexts,
} from './utils';

export class InlineCommentManager extends LifeCycleWatcher {
  static override key = 'inline-comment-manager';

  private readonly _disposables = new DisposableGroup();

  private readonly _highlightedCommentId$ = signal<CommentId | null>(null);

  private get _provider() {
    return this.std.getOptional(CommentProviderIdentifier);
  }

  override mounted() {
    const provider = this._provider;
    if (!provider) return;

    this._init().catch(console.error);

    this._disposables.add(provider.onCommentAdded(this._handleAddComment));
    this._disposables.add(
      provider.onCommentDeleted(this._handleDeleteAndResolve)
    );
    this._disposables.add(
      provider.onCommentResolved(this._handleDeleteAndResolve)
    );
    this._disposables.add(
      provider.onCommentHighlighted(this._handleHighlightComment)
    );
    this._disposables.add(
      this.std.selection.slots.changed.subscribe(this._handleSelectionChanged)
    );
  }

  override unmounted() {
    this._disposables.dispose();
  }

  private async _init() {
    const provider = this._provider;
    if (!provider) return;

    const commentsInProvider = await provider.getComments('unresolved');
    const inlineComments = [...findAllCommentedTexts(this.std.store).values()];

    const blockComments = findAllCommentedBlocks(this.std.store).flatMap(
      block => Object.keys(block.props.comments)
    );

    const commentsInEditor = [
      ...new Set([...inlineComments, ...blockComments]),
    ];

    // resolve comments that are in provider but not in editor
    // which means the commented content may be deleted
    difference(commentsInProvider, commentsInEditor).forEach(comment => {
      provider.resolveComment(comment);
    });

    // remove comments that are in editor but not in provider
    // which means the comment may be removed or resolved in provider side
    difference(commentsInEditor, commentsInProvider).forEach(comment => {
      this._handleDeleteAndResolve(comment);
      this.std.get(BlockCommentManager).handleDeleteAndResolve(comment);
    });
  }

  private readonly _handleAddComment = (
    id: CommentId,
    selections: BaseSelection[]
  ) => {
    const needCommentTexts = selections
      .map(selection => {
        if (!selection.is(TextSelection)) return [];
        const [_, { selectedBlocks }] = this.std.command
          .chain()
          .pipe(getSelectedBlocksCommand, {
            textSelection: selection,
          })
          .run();

        if (!selectedBlocks) return [];

        type MakeRequired<T, K extends keyof T> = T & {
          [key in K]: NonNullable<T[key]>;
        };

        return selectedBlocks
          .map(
            ({ model }) =>
              [model, getInlineEditorByModel(this.std, model)] as const
          )
          .filter(
            (
              pair
            ): pair is [MakeRequired<BlockModel, 'text'>, AffineInlineEditor] =>
              !!pair[0].text && !!pair[1]
          )
          .map(([model, inlineEditor]) => {
            let from: TextRangePoint;
            let to: TextRangePoint | null;
            if (model.id === selection.from.blockId) {
              from = selection.from;
              to = null;
            } else if (model.id === selection.to?.blockId) {
              from = selection.to;
              to = null;
            } else {
              from = {
                blockId: model.id,
                index: 0,
                length: model.text.yText.length,
              };
              to = null;
            }
            return [new TextSelection({ from, to }), inlineEditor] as const;
          });
      })
      .flat();

    if (needCommentTexts.length === 0) return;

    needCommentTexts.forEach(([selection, inlineEditor]) => {
      inlineEditor.formatText(
        selection.from,
        {
          [`comment-${id}`]: true,
        },
        {
          withoutTransact: true,
        }
      );
    });
  };

  private readonly _handleDeleteAndResolve = (id: CommentId) => {
    const commentedTexts = findCommentedTexts(this.std.store, id);
    if (commentedTexts.length === 0) return;

    this.std.store.withoutTransact(() => {
      commentedTexts.forEach(selection => {
        const inlineEditor = getInlineEditorByModel(
          this.std,
          selection.from.blockId
        );

        inlineEditor?.formatText(
          selection.from,
          {
            [`comment-${id}`]: null,
          },
          {
            withoutTransact: true,
          }
        );
      });
    });
  };

  private readonly _handleHighlightComment = (id: CommentId | null) => {
    this._highlightedCommentId$.value = id;
  };

  private readonly _handleSelectionChanged = (selections: BaseSelection[]) => {
    const currentHighlightedCommentId = this._highlightedCommentId$.peek();

    if (selections.length === 1) {
      const selection = selections[0];

      // InlineCommentManager only handle text selection
      if (!selection.is(TextSelection)) return;

      if (!selection.isCollapsed() && currentHighlightedCommentId !== null) {
        this._provider?.highlightComment(null);
        return;
      }

      const model = this.std.store.getModelById(selection.from.blockId);
      if (!model) return;

      const inlineEditor = getInlineEditorByModel(this.std, model);
      if (!inlineEditor) return;

      const delta = inlineEditor.getDeltaByRangeIndex(selection.from.index);
      if (!delta) return;

      const commentIds = extractCommentIdFromDelta(delta);
      if (commentIds.length !== 0) return;
    }

    if (currentHighlightedCommentId !== null) {
      this._provider?.highlightComment(null);
    }
  };
}
