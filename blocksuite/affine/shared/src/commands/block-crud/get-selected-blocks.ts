import type {
  BlockSelection,
  Command,
  SurfaceSelection,
  TextSelection,
} from '@blocksuite/std';
import { BlockComponent } from '@blocksuite/std';
import type { BlockModel, RoleType } from '@blocksuite/store';

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

  const seen = new Set<BlockComponent>();

  // remove duplicate elements
  const result: BlockComponent[] = dirtyResult.filter(el => {
    if (seen.has(el)) return false;
    seen.add(el);
    return true;
  });

  if (result.length > 1) {
    const modelOrder = new Map<string, number>();
    const visit = (model: BlockModel) => {
      modelOrder.set(model.id, modelOrder.size);
      model.children.forEach(visit);
    };
    const root = ctx.std.store.root;
    if (root) {
      visit(root);
    }

    // sort by model tree position, which is the order used for paste/export
    result.sort(
      (a, b) =>
        (modelOrder.get(a.blockId) ?? Number.MAX_SAFE_INTEGER) -
        (modelOrder.get(b.blockId) ?? Number.MAX_SAFE_INTEGER)
    );
  }

  if (result.length === 0) return;

  next({
    selectedBlocks: result,
  });
};
