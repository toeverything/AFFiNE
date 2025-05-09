import { FrameBlockModel } from '@blocksuite/affine-model';
import type { EditorHost } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

import { DocModeProvider } from '../../services/doc-mode-service.js';
import { matchModels } from './checker.js';

/**
 *
 * @example
 * ```md
 * doc
 * - note
 *   - paragraph <- 5
 * - note <- 4 (will be skipped)
 *  - paragraph <- 3
 *    - child <- 2
 *      - child <- 1
 *  - paragraph <- when invoked here, the traverse order will be above
 * ```
 *
 * NOTE: this method will just return blocks with `content` role
 */
export function getPrevContentBlock(
  editorHost: EditorHost,
  model: BlockModel
): BlockModel | null {
  const getPrev = (model: BlockModel) => {
    const parent = model.store.getParent(model);
    if (!parent) return null;

    const index = parent.children.indexOf(model);
    if (index > 0) {
      let tmpIndex = index - 1;
      let prev = parent.children[tmpIndex];

      if (parent.role === 'root' && model.role === 'hub') {
        while (prev && prev.flavour !== 'affine:note') {
          prev = parent.children[tmpIndex];
          tmpIndex--;
        }
      }

      if (!prev) return null;

      while (prev.children.length > 0) {
        prev = prev.children[prev.children.length - 1];
      }
      return prev;
    }

    // in edgeless mode, limit search for the previous block within the same note
    if (
      editorHost.std.get(DocModeProvider).getEditorMode() === 'edgeless' &&
      parent.role === 'hub'
    ) {
      return null;
    }

    return parent;
  };

  const map: Record<string, true> = {};
  const iterate: (model: BlockModel) => BlockModel | null = (
    model: BlockModel
  ) => {
    if (model.id in map) {
      console.error(
        "Can't get previous block! There's a loop in the block tree!"
      );
      return null;
    }
    map[model.id] = true;

    const prev = getPrev(model);
    if (prev) {
      if (prev.role === 'content' && !matchModels(prev, [FrameBlockModel])) {
        return prev;
      }

      return iterate(prev);
    }

    return null;
  };

  return iterate(model);
}

/**
 *
 * @example
 * ```md
 * page
 * - note
 *  - paragraph <- when invoked here, the traverse order will be following
 *    - child <- 1
 *  - sibling <- 2
 * - note <- 3 (will be skipped)
 *   - paragraph <- 4
 * ```
 *
 * NOTE: this method will skip the `affine:note` block
 */
export function getNextContentBlock(
  editorHost: EditorHost,
  model: BlockModel,
  map: Record<string, true> = {}
): BlockModel | null {
  if (model.id in map) {
    console.error("Can't get next block! There's a loop in the block tree!");
    return null;
  }
  map[model.id] = true;

  const doc = model.store;
  if (model.children.length) {
    return model.children[0];
  }
  let currentBlock: typeof model | null = model;
  while (currentBlock) {
    const nextSibling = doc.getNext(currentBlock);
    if (nextSibling) {
      // Assert nextSibling is not possible to be `affine:page`
      if (nextSibling.role === 'hub') {
        // in edgeless mode, limit search for the next block within the same note
        if (
          editorHost.std.get(DocModeProvider).getEditorMode() === 'edgeless'
        ) {
          return null;
        }

        return getNextContentBlock(editorHost, nextSibling);
      }
      return nextSibling;
    }
    currentBlock = doc.getParent(currentBlock);
  }
  return null;
}
