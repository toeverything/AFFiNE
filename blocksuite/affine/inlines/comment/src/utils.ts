import { getInlineEditorByModel } from '@blocksuite/affine-rich-text';
import type { CommentId } from '@blocksuite/affine-shared/services';
import { type BlockStdScope, TextSelection } from '@blocksuite/std';
import type { InlineEditor } from '@blocksuite/std/inline';

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
