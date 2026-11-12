import type {
  DatabaseRefBlockModel,
  NoteBlockModel,
} from '@blocksuite/affine-model';
import { NoteBlockSchema } from '@blocksuite/affine-model';
import {
  type SlashMenuActionItem,
  type SlashMenuConfig,
  SlashMenuConfigExtension,
} from '@blocksuite/affine-widget-slash-menu';
import { PageIcon } from '@blocksuite/icons/lit';
import { BlockSelection } from '@blocksuite/std';

import {
  createReusableNoteAndInsertRefCommand,
  insertNoteRefBlockCommand,
} from '../commands';
import { wouldCreateReferenceCycle } from '../cycle';

/**
 * Same-doc "insert another view of this reusable note" items — mirrors
 * `database-ref`'s `databaseRefSlashMenuConfig`'s `sameDocItems` shape.
 * The current doc's own primary/page note is a valid target like any
 * other — referencing "the page itself" is a real use case (e.g. showing
 * this page's content live elsewhere). Excludes the note that directly
 * contains the invoking model (the trivial 1-hop cycle) outright, and
 * additionally runs every remaining candidate through
 * `wouldCreateReferenceCycle` (see `cycle.ts`) to catch deeper cycles too —
 * a real check, not the "left to the render layer" claim this comment used
 * to make before that turned out not to hold up (`_getAncestorChain`/
 * `_sameChain` are a cache-invalidation check, not cycle detection).
 * `insertNoteRefBlockCommand` re-validates the same thing at insertion
 * time regardless, so this is purely a UX improvement — not offering a
 * candidate that's guaranteed to be rejected — not the sole enforcement
 * point.
 *
 * Also excludes `database-ref`'s own hidden `EdgelessOnly` host notes
 * (created by `ensurePromoted`/`moveIntoHiddenNote` purely to give a
 * promoted table *somewhere* to live — an internal bookkeeping detail of a
 * completely different feature, not user-authored reusable content).
 * Without this, any doc that already has a promoted table shows a
 * confusing unnamed "Note: (empty note)" candidate — since the note's own
 * child is a database, not text, the label logic finds no snippet — and
 * picking it embeds that database instead of any actual note content.
 * Identified precisely (not by a content heuristic, which could also
 * wrongly exclude a legitimate reusable note that itself contains an
 * embedded table) by cross-referencing every existing `database-ref`'s own
 * resolved canonical parent note, rather than guessing from shape alone.
 */
export const noteRefSlashMenuConfig: SlashMenuConfig = {
  items: ({ std, model }) => {
    let index = 0;
    const store = std.store;

    const ownContainingNoteId = (() => {
      let ancestor = store.getParent(model);
      while (ancestor) {
        if (ancestor.flavour === 'affine:note') return ancestor.id;
        ancestor = store.getParent(ancestor);
      }
      return null;
    })();

    const databaseHiddenHostNoteIds = new Set<string>(
      store
        .getBlocksByFlavour('affine:database-ref')
        .map(refBlock => {
          const refModel = refBlock.model as DatabaseRefBlockModel;
          const canonical = store.getBlock(refModel.props.refBlockId)?.model;
          const parent = canonical && store.getParent(canonical);
          return parent?.flavour === 'affine:note' ? parent.id : null;
        })
        .filter((id): id is string => !!id)
    );

    const noteBlocks = store.getBlocksByFlavour(NoteBlockSchema.model.flavour);

    const sameDocItems = noteBlocks
      .filter(block => {
        if (block.id === ownContainingNoteId) return false;
        if (databaseHiddenHostNoteIds.has(block.id)) return false;
        if (
          ownContainingNoteId &&
          wouldCreateReferenceCycle(
            std,
            { docId: store.id, blockId: ownContainingNoteId },
            { docId: store.id, blockId: block.id }
          )
        ) {
          return false;
        }
        return true;
      })
      .map<SlashMenuActionItem>(block => {
        const noteModel = block.model as NoteBlockModel;
        // Mirrors `reader.ts`'s identical fallback for the cross-doc
        // picker: the page/root note has no independent "name" of its own
        // anywhere in the UI — its identity already IS the page — so it
        // uses the doc's own title here too, instead of a child-text
        // snippet. Without this, the page note showed as "Note: <first
        // line of its own content>" instead of the page's actual title,
        // making it effectively unfindable by searching for the page name.
        const docTitle = noteModel.isPageBlock()
          ? (
              store.root as { props?: { title?: { toString(): string } } }
            )?.props?.title?.toString()
          : undefined;
        const snippet = block.model.children
          .map(child => child.text?.toString() ?? '')
          .find(text => text.trim().length > 0);
        const label =
          noteModel.props.name ||
          docTitle ||
          snippet?.slice(0, 40) ||
          '(empty note)';
        return {
          name: 'Note: ' + label,
          icon: PageIcon(),
          group: `5_Edgeless Element@${index++}`,
          action: () => {
            const [_, result] = std.command.exec(insertNoteRefBlockCommand, {
              refBlockId: block.id,
              place: 'after',
              removeEmptyLine: true,
              selectedModels: [model],
            });
            if (!result.insertedNoteRefBlockId) return;
            std.selection.set([
              std.selection.create(BlockSelection, {
                blockId: result.insertedNoteRefBlockId,
              }),
            ]);
          },
        };
      });

    const newNoteItem: SlashMenuActionItem = {
      name: 'New note',
      description:
        'Create a new note you can reference from anywhere on this page',
      icon: PageIcon(),
      group: `5_Edgeless Element@${index++}`,
      action: () => {
        const [_, result] = std.command.exec(
          createReusableNoteAndInsertRefCommand,
          {
            place: 'after',
            removeEmptyLine: true,
            selectedModels: [model],
          }
        );
        if (!result.insertedNoteRefBlockId) return;
        std.selection.set([
          std.selection.create(BlockSelection, {
            blockId: result.insertedNoteRefBlockId,
          }),
        ]);
      },
    };

    return [...sameDocItems, newNoteItem];
  },
};

export const NoteRefSlashMenuConfigExtension = SlashMenuConfigExtension(
  'affine:note-ref',
  noteRefSlashMenuConfig
);
