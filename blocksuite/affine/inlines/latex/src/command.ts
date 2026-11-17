import { suppressingRichTextAutoScroll } from '@blocksuite/affine-rich-text';
import {
  DocModeProvider,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import type { AffineInlineEditor } from '@blocksuite/affine-shared/types';
import type { Command, TextSelection } from '@blocksuite/std';
import type { InlineRange } from '@blocksuite/std/inline';

function openInlineLatexEditor(
  inlineEditor: AffineInlineEditor,
  index: number
) {
  inlineEditor
    .waitForUpdate()
    .then(async () => {
      await inlineEditor.waitForUpdate();

      const textPoint = inlineEditor.getTextPoint(index);
      if (!textPoint) return;
      const [text] = textPoint;
      const latexNode = text.parentElement?.closest('affine-latex-node');
      if (!latexNode) return;
      latexNode.toggleEditor();
    })
    .catch(console.error);
}

function getSingleBlockInlineRange(
  textSelection: TextSelection
): InlineRange | null {
  if (textSelection.to) {
    return null;
  }

  return {
    index: textSelection.from.index,
    length: textSelection.from.length,
  };
}

export const insertInlineLatex: Command<{
  currentTextSelection?: TextSelection;
  textSelection?: TextSelection;
}> = (ctx, next) => {
  const textSelection = ctx.textSelection ?? ctx.currentTextSelection;
  if (!textSelection) return;

  const blockComponent = ctx.std.view.getBlock(textSelection.from.blockId);
  if (!blockComponent) return;

  const richText = blockComponent.querySelector('rich-text');
  if (!richText) return;

  const inlineEditor = richText.inlineEditor;
  if (!inlineEditor) return;

  const inlineRange = getSingleBlockInlineRange(textSelection);
  if (!inlineRange) return;

  const latex = textSelection.isCollapsed()
    ? ''
    : inlineEditor.yTextString.slice(
        inlineRange.index,
        inlineRange.index + inlineRange.length
      );

  // Inserting the new inline node changes `inlineRange`'s identity, which
  // re-triggers `rich-text.ts`'s own "keep caret in view" auto-scroll —
  // and since the new node's own layout hasn't stabilized by the time
  // that effect measures its position, the measurement can be transiently
  // wrong enough to produce a visible page jump, even though the caret
  // never actually left the viewport (confirmed live: happens on
  // initiating an inline equation specifically, not the block-level
  // `/equation`, which doesn't touch an already-focused rich text's own
  // `inlineRange` the same way). Suppressed for the whole insert-and-
  // open-editor window below; see `suppressingRichTextAutoScroll`'s own
  // doc comment.
  suppressingRichTextAutoScroll.add(richText);
  setTimeout(() => suppressingRichTextAutoScroll.delete(richText), 500);

  inlineEditor.insertText(inlineRange, ' ', { latex });
  inlineEditor.setInlineRange({
    index: inlineRange.index,
    length: 1,
  });

  const mode = ctx.std.get(DocModeProvider).getEditorMode() ?? 'page';
  const ifEdgelessText = blockComponent.closest('affine-edgeless-text');
  ctx.std.getOptional(TelemetryProvider)?.track('Latex', {
    from:
      mode === 'page'
        ? 'doc'
        : ifEdgelessText
          ? 'edgeless text'
          : 'edgeless note',
    page: mode === 'page' ? 'doc' : 'edgeless',
    segment: mode === 'page' ? 'doc' : 'whiteboard',
    module: 'inline equation',
    control: 'create inline equation',
  });

  if (textSelection.isCollapsed()) {
    openInlineLatexEditor(inlineEditor, inlineRange.index + 1);
  }

  next();
};
