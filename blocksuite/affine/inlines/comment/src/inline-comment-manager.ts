import { getInlineEditorByModel } from '@blocksuite/affine-rich-text';
import { getSelectedBlocksCommand } from '@blocksuite/affine-shared/commands';
import {
  type CommentId,
  CommentProviderIdentifier,
} from '@blocksuite/affine-shared/services';
import type { AffineInlineEditor } from '@blocksuite/affine-shared/types';
import { DisposableGroup } from '@blocksuite/global/disposable';
import {
  LifeCycleWatcher,
  type TextRangePoint,
  TextSelection,
} from '@blocksuite/std';
import type { BaseSelection, BlockModel } from '@blocksuite/store';

import { findCommentedTexts } from './utils';

export class InlineCommentManager extends LifeCycleWatcher {
  static override key = 'inline-comment-manager';

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
    const commentedTexts = findCommentedTexts(this.std, id);
    if (commentedTexts.length === 0) return;

    this.std.store.withoutTransact(() => {
      commentedTexts.forEach(([selection, inlineEditor]) => {
        inlineEditor.formatText(
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
}
