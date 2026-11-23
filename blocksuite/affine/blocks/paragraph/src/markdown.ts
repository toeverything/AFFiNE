import {
  ListBlockModel,
  ParagraphBlockModel,
  ParagraphBlockSchema,
  type ParagraphType,
} from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { matchModels } from '@blocksuite/affine-shared/utils';
import type { BlockComponent } from '@blocksuite/std';
import { InlineMarkdownExtension } from '@blocksuite/std/inline';

export const ParagraphMarkdownExtension =
  InlineMarkdownExtension<AffineTextAttributes>({
    name: 'heading',
    pattern: /^((#{1,6})|(>))\s$/,
    action: ({ inlineEditor, pattern, inlineRange, prefixText }) => {
      if (inlineEditor.yTextString.slice(0, inlineRange.index).includes('\n')) {
        return;
      }

      const match = prefixText.match(pattern);
      if (!match) return;

      const type = (
        match[2] ? `h${match[2].length}` : 'quote'
      ) as ParagraphType;

      if (!inlineEditor.rootElement) return;
      const blockComponent =
        inlineEditor.rootElement.closest<BlockComponent>('[data-block-id]');
      if (!blockComponent) return;

      const { model, std, store } = blockComponent;
      if (
        !matchModels(model, [ParagraphBlockModel]) &&
        matchModels(model, [ListBlockModel])
      ) {
        const parent = store.getParent(model);
        if (!parent) return;
        const index = parent.children.indexOf(model);

        store.captureSync();
        inlineEditor.deleteText({
          index: 0,
          length: inlineRange.index,
        });
        store.deleteBlock(model, { deleteChildren: false });
        const id = store.addBlock<ParagraphBlockModel>(
          ParagraphBlockSchema.model.flavour,
          {
            type: type,
            text: model.text?.clone(),
            children: model.children,
          },
          parent,
          index
        );

        focusTextModel(std, id);
      } else if (
        matchModels(model, [ParagraphBlockModel]) &&
        model.props.type !== type
      ) {
        store.captureSync();
        inlineEditor.deleteText({
          index: 0,
          length: inlineRange.index,
        });
        store.updateBlock(model, { type });
        focusTextModel(std, model.id);
      }
    },
  });
