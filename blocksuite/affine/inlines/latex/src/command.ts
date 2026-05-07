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
