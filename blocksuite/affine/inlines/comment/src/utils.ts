import { getInlineEditorByModel } from '@blocksuite/affine-rich-text';
import type { CommentId } from '@blocksuite/affine-shared/services';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { type BlockStdScope, TextSelection } from '@blocksuite/std';
import type { InlineEditor } from '@blocksuite/std/inline';
import type { DeltaInsert } from '@blocksuite/store';

export function findAllCommentedTexts(std: BlockStdScope) {
  const selections: [TextSelection, InlineEditor<AffineTextAttributes>][] = [];
  std.store.getAllModels().forEach(model => {
    const inlineEditor = getInlineEditorByModel(std, model);
    if (!inlineEditor) return;

    inlineEditor.mapDeltasInInlineRange(
      {
        index: 0,
        length: inlineEditor.yTextLength,
      },
      (delta, rangeIndex) => {
        if (
          delta.attributes &&
          Object.keys(delta.attributes).some(key => key.startsWith('comment-'))
        ) {
          selections.push([
            new TextSelection({
              from: {
                blockId: model.id,
                index: rangeIndex,
                length: delta.insert.length,
              },
              to: null,
            }),
            inlineEditor,
          ]);
        }
      }
    );
  });

  return selections;
}

export function findCommentedTexts(std: BlockStdScope, commentId: CommentId) {
  return findAllCommentedTexts(std).filter(([selection, inlineEditor]) => {
    const deltas = inlineEditor.getDeltasByInlineRange({
      index: selection.from.index,
      length: selection.from.length,
    });
    return deltas
      .flatMap(([delta]) => extractCommentIdFromDelta(delta))
      .includes(commentId);
  });
}

export function extractCommentIdFromDelta(
  delta: DeltaInsert<AffineTextAttributes>
) {
  if (!delta.attributes) return [];

  return Object.keys(delta.attributes)
    .filter(key => key.startsWith('comment-'))
    .map(key => key.replace('comment-', ''));
}
