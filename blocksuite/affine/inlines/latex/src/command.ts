import {
  DocModeProvider,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import type { Command, TextSelection } from '@blocksuite/std';

export const insertInlineLatex: Command<{
  currentTextSelection?: TextSelection;
  textSelection?: TextSelection;
}> = (ctx, next) => {
  const textSelection = ctx.textSelection ?? ctx.currentTextSelection;
  if (!textSelection || !textSelection.isCollapsed()) return;

  const blockComponent = ctx.std.view.getBlock(textSelection.from.blockId);
  if (!blockComponent) return;

  const richText = blockComponent.querySelector('rich-text');
  if (!richText) return;

  const inlineEditor = richText.inlineEditor;
  if (!inlineEditor) return;

  inlineEditor.insertText(
    {
      index: textSelection.from.index,
      length: 0,
    },
    ' '
  );
  inlineEditor.formatText(
    {
      index: textSelection.from.index,
      length: 1,
    },
    {
      latex: '',
    }
  );
  inlineEditor.setInlineRange({
    index: textSelection.from.index,
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

  inlineEditor
    .waitForUpdate()
    .then(async () => {
      await inlineEditor.waitForUpdate();

      const textPoint = inlineEditor.getTextPoint(textSelection.from.index + 1);
      if (!textPoint) return;
      const [text] = textPoint;
      const latexNode = text.parentElement?.closest('affine-latex-node');
      if (!latexNode) return;
      latexNode.toggleEditor();
    })
    .catch(console.error);

  next();
};
