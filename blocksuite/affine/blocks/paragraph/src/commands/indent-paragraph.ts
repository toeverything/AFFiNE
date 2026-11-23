import { ListBlockModel, ParagraphBlockModel } from '@blocksuite/affine-model';
import type { IndentContext } from '@blocksuite/affine-shared/types';
import {
  calculateCollapsedSiblings,
  getNearestHeadingBefore,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import { type Command, TextSelection } from '@blocksuite/std';

export const canIndentParagraphCommand: Command<
  Partial<Omit<IndentContext, 'flavour' | 'type'>>,
  {
    indentContext: IndentContext;
  }
> = (cxt, next) => {
  let { blockId, inlineIndex } = cxt;
  const { std } = cxt;
  const { selection, store } = std;
  const { schema } = store;

  if (!blockId) {
    const text = selection.find(TextSelection);
    /**
     * Do nothing if the selection:
     * - is not a text selection
     * - or spans multiple blocks
     */
    if (!text || (text.to && text.from.blockId !== text.to.blockId)) {
      return;
    }

    blockId = text.from.blockId;
    inlineIndex = text.from.index;
  }
  if (blockId == null || inlineIndex == null) {
    return;
  }

  const model = std.store.getBlock(blockId)?.model;
  if (!model || !matchModels(model, [ParagraphBlockModel])) {
    return;
  }

  const previousSibling = store.getPrev(model);
  if (
    store.readonly ||
    !previousSibling ||
    !schema.isValid(model.flavour, previousSibling.flavour)
  ) {
    // Bottom, can not indent, do nothing
    return;
  }

  return next({
    indentContext: {
      blockId,
      inlineIndex,
      type: 'indent',
      flavour: 'affine:paragraph',
    },
  });
};

export const indentParagraphCommand: Command<{
  indentContext: IndentContext;
}> = (ctx, next) => {
  const { indentContext, std } = ctx;
  const { store, selection, host, range } = std;

  if (
    !indentContext ||
    indentContext.type !== 'indent' ||
    indentContext.flavour !== 'affine:paragraph'
  ) {
    console.warn(
      'you need to use `canIndentParagraph` command before running `indentParagraph` command'
    );
    return;
  }
  const { blockId } = indentContext;

  const model = store.getBlock(blockId)?.model;
  if (!model) return;

  const previousSibling = store.getPrev(model);
  if (!previousSibling) return;

  store.captureSync();

  {
    // > # 123
    // > # 456
    //
    // we need to update 123 collapsed state to false when indent 456
    const nearestHeading = getNearestHeadingBefore(model);
    if (
      nearestHeading &&
      matchModels(nearestHeading, [ParagraphBlockModel]) &&
      nearestHeading.props.collapsed
    ) {
      store.updateBlock(nearestHeading, {
        collapsed: false,
      });
    }
  }

  if (
    matchModels(model, [ParagraphBlockModel]) &&
    model.props.type.startsWith('h') &&
    model.props.collapsed
  ) {
    const collapsedSiblings = calculateCollapsedSiblings(model);
    store.moveBlocks([model, ...collapsedSiblings], previousSibling);
  } else {
    store.moveBlocks([model], previousSibling);
  }

  {
    // 123
    //   > # 456
    // 789
    //
    // we need to update 456 collapsed state to false when indent 789
    const nearestHeading = getNearestHeadingBefore(model);
    if (
      nearestHeading &&
      matchModels(nearestHeading, [ParagraphBlockModel]) &&
      nearestHeading.props.collapsed
    ) {
      store.updateBlock(nearestHeading, {
        collapsed: false,
      });
    }
  }

  // update collapsed state of affine list
  if (
    matchModels(previousSibling, [ListBlockModel]) &&
    previousSibling.props.collapsed
  ) {
    store.updateBlock(previousSibling, {
      collapsed: false,
    });
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
