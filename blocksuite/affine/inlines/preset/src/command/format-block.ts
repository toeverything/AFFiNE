import { getSelectedBlocksCommand } from '@blocksuite/affine-shared/commands';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import type { BlockSelection, Command } from '@blocksuite/std';
import {
  INLINE_ROOT_ATTR,
  type InlineRootElement,
} from '@blocksuite/std/inline';

import { FORMAT_BLOCK_SUPPORT_FLAVOURS } from './consts.js';

// for block selection
export const formatBlockCommand: Command<{
  currentBlockSelections?: BlockSelection[];
  blockSelections?: BlockSelection[];
  styles: AffineTextAttributes;
  mode?: 'replace' | 'merge';
}> = (ctx, next) => {
  const blockSelections = ctx.blockSelections ?? ctx.currentBlockSelections;
  if (!blockSelections) {
    console.error(
      '`blockSelections` is required, you need to pass it in args or use `getBlockSelections` command before adding this command to the pipeline.'
    );
    return;
  }

  if (blockSelections.length === 0) return;

  const styles = ctx.styles;
  const mode = ctx.mode ?? 'merge';

  const success = ctx.std.command
    .chain()
    .pipe(getSelectedBlocksCommand, {
      blockSelections,
      filter: el => FORMAT_BLOCK_SUPPORT_FLAVOURS.includes(el.model.flavour),
      types: ['block'],
    })
    .pipe((ctx, next) => {
      const { selectedBlocks } = ctx;
      if (!selectedBlocks) {
        console.error(
          '`selectedBlocks` is required, you need to pass it in args or use `getSelectedBlocksCommand` command before adding this command to the pipeline.'
        );
        return;
      }

      const selectedInlineEditors = selectedBlocks.flatMap(el => {
        const inlineRoot = el.querySelector<
          InlineRootElement<AffineTextAttributes>
        >(`[${INLINE_ROOT_ATTR}]`);
        if (inlineRoot) {
          return inlineRoot.inlineEditor;
        }
        return [];
      });

      selectedInlineEditors.forEach(inlineEditor => {
        inlineEditor.formatText(
          {
            index: 0,
            length: inlineEditor.yTextLength,
          },
          styles,
          {
            mode,
          }
        );
      });

      next();
    })
    .run();

  if (success) next();
};
