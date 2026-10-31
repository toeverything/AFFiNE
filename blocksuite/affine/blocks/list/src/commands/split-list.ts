import { ListBlockModel } from '@blocksuite/affine-model';
import { focusTextModel } from '@blocksuite/affine-rich-text';
import {
  getNextContinuousNumberedLists,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import type { Command, EditorHost } from '@blocksuite/std';

import { canDedentListCommand, dedentListCommand } from './dedent-list.js';
import { correctNumberedListsOrderToPrev } from './utils.js';

export const splitListCommand: Command<{
  blockId: string;
  inlineIndex: number;
  // keyboard-enter-focus-loss (desktop, 2026-10-01): callers whose list
  // block is NOT a registered `BlockComponent` in `std.view`'s registry
  // (e.g. a database List view row, rendered by its own `repeat()`
  // directive instead) must pass `skipFocus: true` and do their own
  // focus call afterward. `focusTextModel` below resolves via
  // `RangeBinding`, which tries to sync the native browser selection to
  // match -- for an unregistered component it cannot find a real DOM
  // target and calls `.clear()`, wiping out any focus the caller already
  // established. Confirmed live via a `focusout` capture-phase listener +
  // stack trace (see `ListViewRenderer.splitRowAtCursor`'s own comment).
  skipFocus?: boolean;
}> = (ctx, next) => {
  const { blockId, inlineIndex, skipFocus, std } = ctx;
  const host = std.host as EditorHost;
  const doc = host.store;

  const model = doc.getBlock(blockId)?.model;
  if (!model || !matchModels(model, [ListBlockModel])) {
    console.error(`block ${blockId} is not a list block`);
    return;
  }
  const parent = doc.getParent(model);
  if (!parent) {
    console.error(`block ${blockId} has no parent`);
    return;
  }
  const modelIndex = parent.children.indexOf(model);
  if (modelIndex === -1) {
    console.error(`block ${blockId} is not a child of its parent`);
    return;
  }

  doc.captureSync();

  if (model.props.text.length === 0) {
    /**
     * case 1: target is top most, convert the list into a paragraph
     *
     * before:
     * - aaa
     * - | <- split here
     *   - bbb
     *
     * after:
     * - aaa
     * |
     *   - bbb
     */
    if (parent.role === 'hub') {
      const id = doc.addBlock('affine:paragraph', {}, parent, modelIndex);
      const paragraph = doc.getBlock(id);
      if (!paragraph) return;
      doc.deleteBlock(model, {
        bringChildrenTo: paragraph.model,
      });

      // reset next continuous numbered list's order
      const nextContinuousNumberedLists = getNextContinuousNumberedLists(
        doc,
        paragraph.model
      );
      let base = 1;
      nextContinuousNumberedLists.forEach(list => {
        doc.transact(() => {
          list.props.order = base;
        });
        base += 1;
      });

      if (!skipFocus) {
        host.updateComplete
          .then(() => {
            focusTextModel(std, id);
          })
          .catch(console.error);
      }

      next();
      return;
    }

    /**
     * case 2: not top most, unindent the list
     *
     * before:
     * - aaa
     *   - bbb
     *   - | <- split here
     *   - ccc
     *
     * after:
     * - aaa
     *   - bbb
     * - |
     *   - ccc
     */
    if (parent.role === 'content') {
      host.command
        .chain()
        .pipe(canDedentListCommand, {
          blockId,
          inlineIndex: 0,
        })
        .pipe(dedentListCommand)
        .run();

      next();
      return;
    }

    return;
  }

  let newListId: string | null = null;

  if (model.children.length > 0 && !model.props.collapsed) {
    const afterText = model.props.text.split(inlineIndex);
    if (inlineIndex === 0) {
      /**
       * case 3: list has children (list not collapsed), split the list at the start of line
       *
       * before:
       * - |aaa <- split here
       *   - bbb
       *
       * after:
       * -
       * - |aaa
       *   - bbb
       */
      newListId = doc.addBlock(
        'affine:list',
        {
          type: model.props.type,
          text: afterText,
          order:
            model.props.type === 'numbered' && model.props.order !== null
              ? model.props.order + 1
              : null,
        },
        parent,
        modelIndex + 1
      );
      const newList = doc.getBlock(newListId)?.model;
      if (!newList) return;
      // move children to new list
      doc.moveBlocks(model.children, newList);

      if (model.props.type === 'numbered' && model.props.order !== null) {
        const nextContinuousNumberedLists = getNextContinuousNumberedLists(
          doc,
          newListId
        );
        let base = model.props.order + 2;
        nextContinuousNumberedLists.forEach(list => {
          doc.transact(() => {
            list.props.order = base;
          });
          base += 1;
        });
      }
    } else {
      /**
       * case 4: list has children (list not collapsed), split the list not at the start of line
       *
       * before:
       * - aa|a <- split here
       *   - bbb
       *
       * after:
       * - aa
       *   - |a
       *   - bbb
       */
      newListId = doc.addBlock(
        'affine:list',
        {
          type: model.props.type,
          text: afterText,
          order: model.props.type === 'numbered' ? 1 : null,
        },
        model,
        0
      );

      if (model.props.type === 'numbered') {
        const nextContinuousNumberedLists = getNextContinuousNumberedLists(
          doc,
          newListId
        );
        let base = 2;
        nextContinuousNumberedLists.forEach(list => {
          doc.transact(() => {
            list.props.order = base;
          });
          base += 1;
        });
      }
    }
  } else {
    /**
     * case 5: list has children (list collapsed)
     *
     * before:
     * - aa|a <- split here
     *   - bbb
     *
     * after:
     * - aa
     *   - bbb
     * - |a
     *
     *
     * case 6: list does not have children
     *
     * before:
     * - aa|a <- split here
     * - bbb
     *
     * after:
     * - aa
     * - |a
     * - bbb
     */
    const afterText = model.props.text.split(inlineIndex);
    newListId = doc.addBlock(
      'affine:list',
      {
        type: model.props.type,
        text: afterText,
        order: null,
      },
      parent,
      modelIndex + 1
    );
    correctNumberedListsOrderToPrev(doc, newListId);
  }

  if (newListId) {
    if (!skipFocus) {
      host.updateComplete
        .then(() => {
          focusTextModel(std, newListId);
        })
        .catch(console.error);
    }

    next();
    return;
  }
};
