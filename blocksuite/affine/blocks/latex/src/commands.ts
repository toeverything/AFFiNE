import type { LatexProps } from '@blocksuite/affine-model';
import type { Command } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

import { LatexBlockComponent } from './latex-block.js';

export const insertLatexBlockCommand: Command<
  {
    latex?: string;
    place?: 'after' | 'before';
    removeEmptyLine?: boolean;
    selectedModels?: BlockModel[];
  },
  {
    insertedLatexBlockId: Promise<string>;
  }
> = (ctx, next) => {
  const { selectedModels, latex, place, removeEmptyLine, std } = ctx;
  if (!selectedModels?.length) return;

  const targetModel =
    place === 'before'
      ? selectedModels[0]
      : selectedModels[selectedModels.length - 1];

  const latexBlockProps: Partial<LatexProps> & {
    flavour: 'affine:latex';
  } = {
    flavour: 'affine:latex',
    latex: latex ?? '',
  };

  const result = std.store.addSiblingBlocks(
    targetModel,
    [latexBlockProps],
    place
  );
  if (result.length === 0) return;

  if (removeEmptyLine && targetModel.text?.length === 0) {
    std.store.deleteBlock(targetModel);
  }

  next({
    insertedLatexBlockId: std.host.updateComplete.then(async () => {
      if (!latex) {
        const blockComponent = std.view.getBlock(result[0]);
        if (blockComponent instanceof LatexBlockComponent) {
          await blockComponent.updateComplete;
          blockComponent.toggleEditor();
        }
      }
      return result[0];
    }),
  });
};
