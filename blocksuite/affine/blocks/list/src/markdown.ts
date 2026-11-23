import {
  type ListBlockModel,
  ListBlockSchema,
  type ListType,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { matchModels, toNumberedList } from '@blocksuite/affine-shared/utils';
import type { BlockComponent } from '@blocksuite/std';
import { InlineMarkdownExtension } from '@blocksuite/std/inline';

export const ListMarkdownExtension =
  InlineMarkdownExtension<AffineTextAttributes>({
    name: 'list',
    // group 2: number
    // group 3: bullet
    // group 4: bullet
    // group 5: todo
    // group 6: todo checked
    pattern: /^((\d+\.)|(-)|(\*)|(\[ ?\])|(\[x\]))\s$/,
    action: ({ inlineEditor, pattern, inlineRange, prefixText }) => {
      if (inlineEditor.yTextString.slice(0, inlineRange.index).includes('\n')) {
        return;
      }

      const match = prefixText.match(pattern);
      if (!match) return;

      let type: ListType;

      if (match[2]) {
        type = 'numbered';
      } else if (match[3] || match[4]) {
        type = 'bulleted';
      } else if (match[5] || match[6]) {
        type = 'todo';
      } else {
        return;
      }

      const checked = match[6] !== undefined;

      if (!inlineEditor.rootElement) return;
      const blockComponent =
        inlineEditor.rootElement.closest<BlockComponent>('[data-block-id]');
      if (!blockComponent) return;

      const { model, std, store } = blockComponent;
      if (!matchModels(model, [ParagraphBlockModel])) return;

      if (type !== 'numbered') {
        const parent = store.getParent(model);
        if (!parent) return;
        const index = parent.children.indexOf(model);

        store.captureSync();
        inlineEditor.deleteText({
          index: 0,
          length: inlineRange.index,
        });
        const id = store.addBlock<ListBlockModel>(
          ListBlockSchema.model.flavour,
          {
            type: type,
            text: model.text?.clone(),
            children: model.children,
            ...(type === 'todo' ? { checked } : {}),
          },
          parent,
          index
        );
        store.deleteBlock(model, { deleteChildren: false });
        focusTextModel(std, id);
      } else {
        let order = parseInt(match[2]);
        if (!Number.isInteger(order)) order = 1;

        store.captureSync();
        inlineEditor.deleteText({
          index: 0,
          length: inlineRange.index,
        });

        const id = toNumberedList(std, model, order);
        if (!id) return;

        focusTextModel(std, id);
      }
    },
  });
