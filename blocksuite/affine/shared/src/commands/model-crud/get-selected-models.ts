import type { Command } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

import { getSelectedBlocksCommand } from '../block-crud/get-selected-blocks';
import {
  getBlockSelectionsCommand,
  getImageSelectionsCommand,
  getSurfaceSelectionCommand,
  getTextSelectionCommand,
} from '../selection';

/**
 * Retrieves the selected models based on the provided selection types and mode.
 *
 * @param ctx - The command context, which includes the types of selections to be retrieved and the mode of the selection.
 * @param ctx.types - The selection types to be retrieved. Can be an array of 'block', 'text', 'image', or 'surface'.
 * @param ctx.mode - The mode of the selection. Can be 'all', 'flat', or 'highest'.
 * @example
 * // Assuming `commandContext` is an instance of the command context
 * getSelectedModelsCommand(commandContext, (result) => {
 *   console.log(result.selectedModels);
 * });
 *
 * // Example selection:
 * // aaa
 * //   b[bb
 * //     ccc
 * // ddd
 * //   ee]e
 *
 * // all mode: [aaa, bbb, ccc, ddd, eee]
 * // flat mode: [bbb, ccc, ddd, eee]
 * // highest mode: [bbb, ddd]
 *
 * // The match function will be evaluated before filtering using mode
 * @param next - The next function to be called.
 * @returns An object containing the selected models as an array of BlockModel instances.
 */
export const getSelectedModelsCommand: Command<
  {
    types?: Array<'image' | 'text' | 'block' | 'surface'>;
    mode?: 'all' | 'flat' | 'highest';
  },
  {
    selectedModels: BlockModel[];
  }
> = (ctx, next) => {
  const types = ctx.types ?? ['block', 'text', 'image', 'surface'];
  const mode = ctx.mode ?? 'flat';
  const selectedModels: BlockModel[] = [];
  ctx.std.command
    .chain()
    .tryAll(chain => [
      chain.pipe(getTextSelectionCommand),
      chain.pipe(getBlockSelectionsCommand),
      chain.pipe(getImageSelectionsCommand),
      chain.pipe(getSurfaceSelectionCommand),
    ])
    .pipe(getSelectedBlocksCommand, { types, mode })
    .pipe(ctx => {
      const { selectedBlocks = [] } = ctx;
      selectedModels.push(...selectedBlocks.map(el => el.model));
    })
    .run();

  next({ selectedModels });
};
