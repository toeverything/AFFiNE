import type { Command, TextSelection } from '@blocksuite/block-std';

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
