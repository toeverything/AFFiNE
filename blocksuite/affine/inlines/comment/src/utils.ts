import { getInlineEditorByModel } from '@blocksuite/affine-rich-text';
import type { CommentId } from '@blocksuite/affine-shared/services';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { type BlockStdScope, TextSelection } from '@blocksuite/std';
import type { InlineEditor } from '@blocksuite/std/inline';
import type { DeltaInsert } from '@blocksuite/store';

export function findCommentedTexts(std: BlockStdScope, commentId: CommentId) {
  const selections: [TextSelection, InlineEditor][] = [];
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
          Object.keys(delta.attributes).some(
            key => key === `comment-${commentId}`
          )
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

export function extractCommentIdFromDelta(
  delta: DeltaInsert<AffineTextAttributes>
) {
  if (!delta.attributes) return [];

  return Object.keys(delta.attributes)
    .filter(key => key.startsWith('comment-'))
    .map(key => key.replace('comment-', ''));
}
