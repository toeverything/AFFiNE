import {
  type CodeBlockModel,
  CodeBlockSchema,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { matchModels } from '@blocksuite/affine-shared/utils';
import type { BlockComponent } from '@blocksuite/std';
import { InlineMarkdownExtension } from '@blocksuite/std/inline';

export const CodeBlockMarkdownExtension =
  InlineMarkdownExtension<AffineTextAttributes>({
    name: 'code-block',
    pattern: /^```([a-zA-Z0-9]*)\s$/,
    action: ({ inlineEditor, inlineRange, prefixText, pattern }) => {
      if (inlineEditor.yTextString.slice(0, inlineRange.index).includes('\n')) {
        return;
      }

      const match = prefixText.match(pattern);
      if (!match) return;

      const language = match[1];

      if (!inlineEditor.rootElement) return;
      const blockComponent =
        inlineEditor.rootElement.closest<BlockComponent>('[data-block-id]');
      if (!blockComponent) return;

      const { model, std, store } = blockComponent;

      if (
        matchModels(model, [ParagraphBlockModel]) &&
        model.props.type === 'quote'
      ) {
        return;
      }

      const parent = store.getParent(model);
      if (!parent) return;
      const index = parent.children.indexOf(model);

      store.captureSync();
      const codeId = store.addBlock<CodeBlockModel>(
        CodeBlockSchema.model.flavour,
        { language },
        parent,
        index
      );

      if (model.text && model.text.length > prefixText.length) {
        const text = model.text.clone();
        store.addBlock('affine:paragraph', { text }, parent, index + 1);
        text.delete(0, prefixText.length);
      }
      store.deleteBlock(model, { bringChildrenTo: parent });

      focusTextModel(std, codeId);
    },
  });
