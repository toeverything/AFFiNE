import type {
  BlockSelection,
  Command,
  SurfaceSelection,
  TextSelection,
} from '@blocksuite/std';
import { BlockComponent } from '@blocksuite/std';
import type { RoleType } from '@blocksuite/store';

import type { ImageSelection } from '../../selection/index.js';

export const getSelectedBlocksCommand: Command<
  {
    currentTextSelection?: TextSelection;
    currentBlockSelections?: BlockSelection[];
    currentImageSelections?: ImageSelection[];
    currentSurfaceSelection?: SurfaceSelection;
    textSelection?: TextSelection;
    blockSelections?: BlockSelection[];
    imageSelections?: ImageSelection[];
    surfaceSelection?: SurfaceSelection;
    filter?: (el: BlockComponent) => boolean;
    types?: Array<'image' | 'text' | 'block' | 'surface'>;
    roles?: RoleType[];
    mode?: 'all' | 'flat' | 'highest';
  },
  {
    selectedBlocks: BlockComponent[];
  }
> = (ctx, next) => {
  const {
    types = ['block', 'text', 'image', 'surface'],
    roles = ['content'],
    mode = 'flat',
  } = ctx;

  let dirtyResult: BlockComponent[] = [];

  const textSelection = ctx.textSelection ?? ctx.currentTextSelection;
  if (types.includes('text') && textSelection) {
    try {
      const range = ctx.std.range.textSelectionToRange(textSelection);
      if (!range) return;

      const selectedBlocks = ctx.std.range.getSelectedBlockComponentsByRange(
        range,
        {
          match: (el: BlockComponent) => roles.includes(el.model.role),
          mode,
        }
      );
      dirtyResult.push(...selectedBlocks);
    } catch {
      return;
    }
  }

  const blockSelections = ctx.blockSelections ?? ctx.currentBlockSelections;
  if (types.includes('block') && blockSelections) {
    const viewStore = ctx.std.view;
    const doc = ctx.std.store;
    const selectedBlockComponents = blockSelections.flatMap(selection => {
      const el = viewStore.getBlock(selection.blockId);
      if (!el) {
        return [];
      }
      const blocks: BlockComponent[] = [el];
      let selectionPath = selection.blockId;
      if (mode === 'all') {
        let parent = null;
        do {
          parent = doc.getParent(selectionPath);
          if (!parent) {
            break;
          }
          const view = parent;
          if (
            view instanceof BlockComponent &&
            !roles.includes(view.model.role)
          ) {
            break;
          }
          selectionPath = parent.id;
        } while (parent);
        parent = viewStore.getBlock(selectionPath);
        if (parent) {
          blocks.push(parent);
        }
      }
      if (['all', 'flat'].includes(mode)) {
        viewStore.walkThrough(node => {
          const view = node;
          if (!(view instanceof BlockComponent)) {
            return true;
          }
          if (roles.includes(view.model.role)) {
            blocks.push(view);
          }
          return;
        }, selectionPath);
      }
      return blocks;
    });
    dirtyResult.push(...selectedBlockComponents);
  }

  const imageSelections = ctx.imageSelections ?? ctx.currentImageSelections;
  if (types.includes('image') && imageSelections) {
    const viewStore = ctx.std.view;
    const selectedBlocks = imageSelections
      .map(selection => {
        const el = viewStore.getBlock(selection.blockId);
        return el;
      })
      .filter((el): el is BlockComponent => Boolean(el));
    dirtyResult.push(...selectedBlocks);
  }

  const surfaceSelection = ctx.surfaceSelection ?? ctx.currentSurfaceSelection;
  if (types.includes('surface') && surfaceSelection) {
    const viewStore = ctx.std.view;
    const selectedBlocks = surfaceSelection.elements
      .map(id => viewStore.getBlock(id))
      .filter(block => !!block);
    dirtyResult.push(...selectedBlocks);
  }

  if (ctx.filter) {
    dirtyResult = dirtyResult.filter(ctx.filter);
  }

  // remove duplicate elements
  const result: BlockComponent[] = dirtyResult
    .filter((el, index) => dirtyResult.indexOf(el) === index)
    // sort by document position
    .sort((a, b) => {
      if (a === b) {
        return 0;
      }

      const position = a.compareDocumentPosition(b);
      if (
        position & Node.DOCUMENT_POSITION_FOLLOWING ||
        position & Node.DOCUMENT_POSITION_CONTAINED_BY
      ) {
        return -1;
      }

      if (
        position & Node.DOCUMENT_POSITION_PRECEDING ||
        position & Node.DOCUMENT_POSITION_CONTAINS
      ) {
        return 1;
      }

      return 0;
    });

  if (result.length === 0) return;

  next({
    selectedBlocks: result,
  });
};
