import { ParagraphBlockModel } from '@blocksuite/affine-model';
import {
  calculateCollapsedSiblings,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import { type Command, TextSelection } from '@blocksuite/std';

import { dedentBlock } from './dedent-block';

export const dedentBlocks: Command<{
  blockIds?: string[];
  stopCapture?: boolean;
}> = (ctx, next) => {
  let { blockIds } = ctx;
  const { std, stopCapture = true } = ctx;
  const { store, selection, range, host } = std;
  const { schema } = store;

  if (!blockIds || !blockIds.length) {
    const nativeRange = range.value;
    if (nativeRange) {
      const topBlocks = range.getSelectedBlockComponentsByRange(nativeRange, {
        match: el => el.model.role === 'content',
        mode: 'highest',
      });
      if (topBlocks.length > 0) {
        blockIds = topBlocks.map(block => block.blockId);
      }
    } else {
      blockIds = std.selection.getGroup('note').map(sel => sel.blockId);
    }
  }

  if (!blockIds || !blockIds.length || store.readonly) return;

  // Find the first model that can be unindented
  let firstDedentIndex = -1;
  for (let i = 0; i < blockIds.length; i++) {
    const model = store.getBlock(blockIds[i])?.model;
    if (!model) continue;
    const parent = store.getParent(blockIds[i]);
    if (!parent) continue;
    const grandParent = store.getParent(parent);
    if (!grandParent) continue;

    if (schema.isValid(model.flavour, grandParent.flavour)) {
      firstDedentIndex = i;
      break;
    }
  }

  if (firstDedentIndex === -1) return;

  if (stopCapture) store.captureSync();

  const collapsedIds: string[] = [];
  blockIds.slice(firstDedentIndex).forEach(id => {
    const model = store.getBlock(id)?.model;
    if (!model) return;
    if (
      matchModels(model, [ParagraphBlockModel]) &&
      model.props.type.startsWith('h') &&
      model.props.collapsed
    ) {
      const collapsedSiblings = calculateCollapsedSiblings(model);
      collapsedIds.push(...collapsedSiblings.map(sibling => sibling.id));
    }
  });
  // Models waiting to be dedented
  const dedentIds = blockIds
    .slice(firstDedentIndex)
    .filter(id => !collapsedIds.includes(id));
  dedentIds.reverse().forEach(id => {
    std.command.exec(dedentBlock, { blockId: id, stopCapture: false });
  });

  const textSelection = selection.find(TextSelection);
  if (textSelection) {
    host.updateComplete
      .then(() => {
        range.syncTextSelectionToRange(textSelection);
      })
      .catch(console.error);
  }

  return next();
};
