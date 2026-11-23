import { ParagraphBlockModel } from '@blocksuite/affine-model';
import {
  calculateCollapsedSiblings,
  getNearestHeadingBefore,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import { type Command, TextSelection } from '@blocksuite/std';

import { indentBlock } from './indent-block';

export const indentBlocks: Command<{
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

  // Find the first model that can be indented
  let firstIndentIndex = -1;
  for (let i = 0; i < blockIds.length; i++) {
    const previousSibling = store.getPrev(blockIds[i]);
    const model = store.getBlock(blockIds[i])?.model;
    if (
      model &&
      previousSibling &&
      schema.isValid(model.flavour, previousSibling.flavour)
    ) {
      firstIndentIndex = i;
      break;
    }
  }

  // No model can be indented
  if (firstIndentIndex === -1) return;

  if (stopCapture) store.captureSync();

  const collapsedIds: string[] = [];
  blockIds.slice(firstIndentIndex).forEach(id => {
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
  // Models waiting to be indented
  const indentIds = blockIds
    .slice(firstIndentIndex)
    .filter(id => !collapsedIds.includes(id));
  const firstModel = store.getBlock(indentIds[0])?.model;
  if (!firstModel) return;

  {
    // > # 123
    // > # 456
    // > # 789
    //
    // we need to update 123 collapsed state to false when indent 456 and 789

    const nearestHeading = getNearestHeadingBefore(firstModel);
    if (
      nearestHeading &&
      matchModels(nearestHeading, [ParagraphBlockModel]) &&
      nearestHeading.props.collapsed
    ) {
      store.updateBlock(nearestHeading, { collapsed: false });
    }
  }

  indentIds.forEach(id => {
    std.command.exec(indentBlock, { blockId: id, stopCapture: false });
  });

  {
    // 123
    //   > # 456
    // 789
    // 012
    //
    // we need to update 456 collapsed state to false when indent 789 and 012
    const nearestHeading = getNearestHeadingBefore(firstModel);
    if (
      nearestHeading &&
      matchModels(nearestHeading, [ParagraphBlockModel]) &&
      nearestHeading.props.collapsed
    ) {
      store.updateBlock(nearestHeading, { collapsed: false });
    }
  }

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
