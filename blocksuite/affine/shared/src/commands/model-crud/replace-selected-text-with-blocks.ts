import type { BlockModel, Store } from '@blocksuite/affine/store';
import type { Command, TextSelection } from '@blocksuite/std';
import { match } from 'ts-pattern';

import { getBlockProps } from '../../utils';

/**
 * Determines if blocks can be merged based on their types
 * - Paragraphs can always be merged to
 * - Other blocks can only be merged with blocks of the same type
 * @FIXME: decouple the mergeable block types from the command
 */
const canMergeBlocks = (blockA: BlockModel, blockB: BlockModel): boolean => {
  // Paragraphs can always be merged to
  if (blockB.flavour === 'affine:paragraph') {
    return true;
  }

  // Other blocks can only be merged with blocks of the same type
  return blockA.flavour === blockB.flavour;
};

/**
 * Check if a block is mergeable in general
 * @FIXME: decouple the mergeable block types from the command
 */
const isMergableBlock = (block: BlockModel): boolean => {
  // Blocks that can potentially be merged
  const mergableTypes = ['affine:paragraph', 'affine:list'];

  return mergableTypes.includes(block.flavour);
};

type SnapshotPattern = {
  multiple: boolean;
  canMergeWithStart?: boolean;
  canMergeWithEnd?: boolean;
};

const getBlocksPattern = (
  blocks: BlockModel[],
  startBlockModel: BlockModel,
  endBlockModel?: BlockModel
): SnapshotPattern => {
  const firstBlock = blocks[0];
  const lastBlock = blocks[blocks.length - 1];

  const isFirstMergable = isMergableBlock(firstBlock);
  const isLastMergable = isMergableBlock(lastBlock);

  return {
    multiple: blocks.length > 1,
    canMergeWithStart:
      isFirstMergable && canMergeBlocks(startBlockModel, firstBlock),
    canMergeWithEnd:
      isLastMergable && endBlockModel
        ? canMergeBlocks(endBlockModel, lastBlock)
        : false,
  };
};

const mergeText = (
  targetModel: BlockModel,
  sourceBlock: BlockModel,
  offset: number
) => {
  if (targetModel.text && sourceBlock.text) {
    const sourceText = sourceBlock.text.toString();
    if (sourceText.length > 0) {
      targetModel.text.insert(sourceText, offset);
    }
  }
};

const splitParagraph = (
  doc: any,
  parent: any,
  blockModel: BlockModel,
  index: number,
  splitOffset: number
): BlockModel => {
  // Create a new block of the same type as the original
  const newBlockId = doc.addBlock(blockModel.flavour, {}, parent, index + 1);
  const nextBlock = doc.getBlock(newBlockId);
  if (nextBlock?.model.text && blockModel.text) {
    const textToMove = blockModel.text.toString().slice(splitOffset);
    nextBlock.model.text.insert(textToMove, 0);
    blockModel.text.delete(splitOffset, blockModel.text.length - splitOffset);
  }
  return nextBlock.model;
};

const getSelectedBlocks = (
  doc: Store,
  textSelection: TextSelection
): BlockModel[] | null => {
  const selectedBlocks: BlockModel[] = [];
  const fromBlock = doc.getBlock(textSelection.from.blockId)?.model;
  if (!fromBlock) return null;
  selectedBlocks.push(fromBlock);

  // If the selection spans multiple blocks, add the blocks in between
  if (textSelection.to) {
    const toBlock = doc.getBlock(textSelection.to.blockId)?.model;
    if (!toBlock) return null;

    if (fromBlock.id !== toBlock.id) {
      let currentBlock = fromBlock;
      while (currentBlock.id !== toBlock.id) {
        const nextBlock = doc.getNext(currentBlock);
        if (!nextBlock) break;
        selectedBlocks.push(nextBlock);
        currentBlock = nextBlock;
      }
    }
  }

  return selectedBlocks;
};

const deleteSelectedText = (doc: Store, textSelection: TextSelection) => {
  const selectedBlocks = getSelectedBlocks(doc, textSelection);
  if (!selectedBlocks || selectedBlocks.length === 0) return null;

  const firstBlock = selectedBlocks[0];
  const lastBlock = selectedBlocks[selectedBlocks.length - 1];
  const startOffset = textSelection.from.index;

  if (textSelection.to) {
    // Delete text from startOffset to the end in the first block
    if (firstBlock.text) {
      firstBlock.text.delete(startOffset, firstBlock.text.length - startOffset);
    }

    // Delete text from the beginning to endOffset in the last block
    if (lastBlock.text) {
      lastBlock.text.delete(textSelection.to.index, textSelection.to.length);
    }

    // Merge first block and last block
    if (firstBlock.text && lastBlock.text) {
      firstBlock.text.insert(lastBlock.text.toString(), startOffset);
    }

    // Delete the blocks in between
    selectedBlocks.slice(1).forEach(block => {
      doc.deleteBlock(block);
    });
  } else {
    // Single block selection case
    if (firstBlock.text) {
      firstBlock.text.delete(startOffset, textSelection.from.length);
    }
  }

  return { startBlockModel: firstBlock, endBlockModel: lastBlock, startOffset };
};

const addBlocks = (
  doc: any,
  blocks: BlockModel[],
  parent: any,
  from: number
) => {
  blocks.forEach((block, index) => {
    const blockProps = {
      ...getBlockProps(block),
      text: block.text?.clone(),
      children: block.children,
    };
    doc.addBlock(block.flavour, blockProps, parent, from + index);
  });
};

/**
 * Replace the selected text with the given blocks
 *
 * @warning This command is currently being optimized, please do not use it.
 * @param ctx
 * @param next
 * @returns
 */
export const replaceSelectedTextWithBlocksCommand: Command<{
  textSelection: TextSelection;
  blocks: BlockModel[];
}> = (ctx, next) => {
  const { textSelection, blocks, std } = ctx;
  const doc = std.host.store;

  // Delete selected text and get startOffset
  const result = deleteSelectedText(doc, textSelection);
  if (!result) return next();
  const { startBlockModel, endBlockModel, startOffset } = result;

  const parent = doc.getParent(startBlockModel.id);
  if (!parent) return next();

  const pattern = getBlocksPattern(blocks, startBlockModel, endBlockModel);
  const startIndex = parent.children.findIndex(
    x => x.id === startBlockModel.id
  );

  match(pattern)
    .with({ multiple: false, canMergeWithStart: true }, () => {
      /**
       * Case: Single block that can merge with start block
       *
       * ```tsx
       * const doc = (
       *   <doc>
       *     <paragraph>Hel<anchor />lo</paragraph>
       *     <paragraph>Wor<focus />ld</paragraph>
       *   </doc>
       * );
       *
       * const snapshot = [
       *   <paragraph>111</paragraph>,
       * ];
       *
       * const expected = (
       *   <doc>
       *     <paragraph>Hel111ld</paragraph>
       *   </doc>
       * );
       * ```
       */
      mergeText(startBlockModel, blocks[0], startOffset);
    })
    .with(
      {
        multiple: true,
        canMergeWithStart: true,
        canMergeWithEnd: true,
      },
      () => {
        /**
         * Case: Both first and last blocks are mergable with start and end blocks
         *
         * ```tsx
         * const doc = (
         *   <doc>
         *     <paragraph>Hel<anchor />lo</paragraph>
         *     <paragraph>Wor<focus />ld</paragraph>
         *   </doc>
         * );
         *
         * const snapshot = [
         *   <paragraph>111</paragraph>,
         *   <code />
         *   <code />
         *   <paragraph>222</paragraph>,
         * ];
         *
         * const expected = (
         *   <doc>
         *     <paragraph>Hel111</paragraph>
         *     <code />
         *     <code />
         *     <paragraph>222ld</paragraph>
         *   </doc>
         * );
         */
        const nextBlockModel = splitParagraph(
          doc,
          parent,
          startBlockModel,
          startIndex,
          startOffset
        );
        mergeText(startBlockModel, blocks[0], startOffset);
        mergeText(nextBlockModel, blocks[blocks.length - 1], 0);
        const restBlocks = blocks.slice(1, -1);
        if (restBlocks.length > 0) {
          addBlocks(doc, restBlocks, parent, startIndex + 1);
        }
      }
    )
    .with(
      {
        multiple: true,
        canMergeWithStart: true,
        canMergeWithEnd: false,
      },
      () => {
        /**
         * Case: First block is mergable with start block, but last block isn't with end block
         *
         * ```tsx
         * const doc = (
         *   <doc>
         *     <paragraph>Hel<anchor />lo</paragraph>
         *     <paragraph>Wor<focus />ld</paragraph>
         *   </doc>
         * );
         *
         * const snapshot = [
         *   <paragraph>111</paragraph>,
         *   <code />
         *   <code />
         * ];
         *
         * const expected = (
         *   <doc>
         *     <paragraph>Hel111</paragraph>
         *     <code />
         *     <code />
         *     <paragraph>ld</paragraph>
         *   </doc>
         * );
         * ```
         */
        splitParagraph(doc, parent, startBlockModel, startIndex, startOffset);
        mergeText(startBlockModel, blocks[0], startOffset);
        const restBlocks = blocks.slice(1);
        if (restBlocks.length > 0) {
          addBlocks(doc, restBlocks, parent, startIndex + 1);
        }
      }
    )
    .with(
      {
        multiple: true,
        canMergeWithStart: false,
        canMergeWithEnd: true,
      },
      () => {
        /**
         * Case: First block isn't mergable with start block, but last block is with end block
         *
         * ```tsx
         * const doc = (
         *   <doc>
         *     <paragraph>Hel<anchor />lo</paragraph>
         *     <paragraph>Wor<focus />ld</paragraph>
         *   </doc>
         * );
         *
         * const snapshot = [
         *   <code />
         *   <code />
         *   <paragraph>222</paragraph>
         * ];
         *
         * const expected = (
         *   <doc>
         *     <paragraph>Hel</paragraph>
         *     <code />
         *     <code />
         *     <paragraph>222ld</paragraph>
         *   </doc>
         * );
         * ```
         */
        const nextBlockModel = splitParagraph(
          doc,
          parent,
          startBlockModel,
          startIndex,
          startOffset
        );
        mergeText(nextBlockModel as BlockModel, blocks[blocks.length - 1], 0);
        const restBlocks = blocks.slice(0, -1);
        if (restBlocks.length > 0) {
          addBlocks(doc, restBlocks, parent, startIndex + 1);
        }
      }
    )
    .otherwise(() => {
      /**
       * Default case: No mergable blocks or blocks that can't be merged
       *
       * ```tsx
       * const doc = (
       *   <doc>
       *     <paragraph>Hel<anchor />lo</paragraph>
       *     <paragraph>Wor<focus />ld</paragraph>
       *   </doc>
       * );
       *
       * const snapshot = [
       *   <code />
       *   <code />
       * ];
       *
       * const expected = (
       *   <doc>
       *     <paragraph>Hel</paragraph>
       *     <code />
       *     <code />
       *     <paragraph>ld</paragraph>
       *   </doc>
       * );
       * ```
       */
      splitParagraph(doc, parent, startBlockModel, startIndex, startOffset);
      addBlocks(doc, blocks, parent, startIndex + 1);
    });
  return next();
};
