import { toast } from '@blocksuite/affine-components/toast';
import type {
  DatabaseRefProps,
  NoteBlockModel,
} from '@blocksuite/affine-model';
import { NoteDisplayMode } from '@blocksuite/affine-model';
import {
  ensureDocLoaded,
  waitForBlockInDoc,
} from '@blocksuite/affine-shared/utils';
import type { Command } from '@blocksuite/std';
import type { BlockModel, Store } from '@blocksuite/store';

/**
 * Ensures `targetBlock` (an `affine:database`) is safe to reference more
 * than once: if it's still living as an ordinary block in a normal,
 * visible note, this relocates it into a dedicated hidden note
 * (`displayMode: EdgelessOnly`, parked off-canvas — never part of the
 * normal reading/editing flow, mirroring how a Frame lives on the surface
 * rather than in page content) and replaces its old visible position with
 * a `database-ref` pointing at it. From that point on there is no
 * "original" — every visible appearance, old and new, is an equal
 * `database-ref`, and deleting any one of them just removes that view; the
 * underlying data is never reachable by an ordinary text-range deletion.
 *
 * A database whose parent is already an `EdgelessOnly` note is treated as
 * already promoted and left alone — this covers both "we promoted it
 * ourselves earlier" and "the user already had it somewhere hidden for
 * unrelated reasons," since the only invariant this cares about is "not
 * reachable by ordinary in-flow selection," not who put it there.
 */
/**
 * The "move into a hidden note" half of `ensurePromoted`, extracted so
 * anything that just needs a canonical table already living somewhere
 * hidden (without also leaving a same-doc reference behind at the old
 * spot — e.g. simulating a table that's only ever cross-doc referenced)
 * can reuse the exact same logic instead of hand-rolling it. Returns the
 * hidden note's id, or `null` if already promoted / nothing to do.
 */
export function moveIntoHiddenNote(
  store: Store,
  targetBlock: BlockModel
): string | null {
  const parent = store.getParent(targetBlock);
  if (
    parent &&
    parent.flavour === 'affine:note' &&
    (parent as NoteBlockModel).props.displayMode ===
      NoteDisplayMode.EdgelessOnly
  ) {
    return null;
  }

  const root = store.root;
  if (!root) return null;

  const hiddenNoteId = store.addBlock(
    'affine:note',
    {
      displayMode: NoteDisplayMode.EdgelessOnly,
      // `xywh` is only load-bearing for the edgeless canvas (e.g. where a
      // "jump to source" affordance would frame it); the renderer
      // (`database-ref-block.ts`) mounts this note's content through a
      // page-mode nested scope, which sizes to its own content and doesn't
      // consult this bound at all.
      xywh: '[-10000, -10000, 800, 480]',
    },
    root.id
  );
  const hiddenNote = store.getModelById(hiddenNoteId);
  if (!hiddenNote) return null;

  store.moveBlocks([targetBlock], hiddenNote);
  return hiddenNoteId;
}

export function ensurePromoted(store: Store, targetBlock: BlockModel): void {
  const parent = store.getParent(targetBlock);
  const oldIndex = parent ? parent.children.indexOf(targetBlock) : -1;

  const hiddenNoteId = moveIntoHiddenNote(store, targetBlock);
  if (!hiddenNoteId) return;

  if (parent && oldIndex !== -1) {
    store.addBlock(
      'affine:database-ref',
      { refBlockId: targetBlock.id, refDocId: store.id },
      parent,
      oldIndex
    );
  }
}

export const insertDatabaseRefBlockCommand: Command<
  {
    refBlockId: string;
    place: 'after' | 'before';
    removeEmptyLine?: boolean;
    selectedModels?: BlockModel[];
    // Set for a cross-doc reference (Story 0.3): the target database
    // already lives in its own doc, so no promotion/move is needed — that
    // dance exists only to avoid two sources of truth for a *same-doc*
    // second reference. Unset (the 0.2 same-page case) defaults to the
    // current doc, exactly as before.
    refDocId?: string;
  },
  {
    insertedDatabaseRefBlockId: string;
  }
> = (ctx, next) => {
  const { selectedModels, refBlockId, place, removeEmptyLine, refDocId, std } =
    ctx;
  if (!selectedModels?.length) return;

  const targetModel =
    place === 'before'
      ? selectedModels[0]
      : selectedModels[selectedModels.length - 1];

  const store = std.store;
  const isCrossDoc = !!refDocId && refDocId !== store.id;

  if (isCrossDoc) {
    // Unlike the same-doc case, the target doc may not have finished
    // loading its content locally yet (a doc the user hasn't opened this
    // session can take a real amount of time to stream in) — mirrors
    // `insertSurfaceRefBlockCommand`'s cross-doc branch, which likewise
    // trusts the caller (the cross-doc picker already validated the
    // candidate via the indexer) rather than requiring the target to be
    // synchronously resolvable at insertion time. The block's own renderer
    // (`database-ref-block.ts`) already retries once the target doc's
    // content actually arrives, so refusing to insert here would only
    // strand the user with nothing created at all.
    const refDoc = std.workspace.getDoc(refDocId);
    if (!refDoc) {
      console.error(`referenced doc not found ${refDocId}`);
      return;
    }
    ensureDocLoaded(refDoc);
  } else {
    const targetBlock = store.getBlock(refBlockId)?.model;
    if (!targetBlock || targetBlock.flavour !== 'affine:database') {
      console.error(`referenced database block not found ${refBlockId}`);
      return;
    }
  }

  store.captureSync();

  if (!isCrossDoc) {
    const targetBlock = store.getBlock(refBlockId)?.model;
    if (targetBlock) ensurePromoted(store, targetBlock);
  }

  const databaseRefProps: Partial<DatabaseRefProps> & {
    flavour: 'affine:database-ref';
  } = {
    flavour: 'affine:database-ref',
    refBlockId,
    refDocId: refDocId ?? store.id,
  };

  const result = store.addSiblingBlocks(targetModel, [databaseRefProps], place);
  if (result.length === 0) return;

  if (removeEmptyLine && targetModel.text?.length === 0) {
    store.deleteBlock(targetModel);
  }

  if (isCrossDoc) {
    // Trusts the picker's candidate rather than validating it exists
    // synchronously (see the comment above) — verifies in the background
    // instead, and surfaces a toast if a stale/deleted candidate never
    // actually materializes, rather than failing silently forever.
    const refDoc = std.workspace.getDoc(refDocId);
    if (refDoc) {
      waitForBlockInDoc(refDoc, refBlockId)
        .then(found => {
          const targetFlavour = found
            ? refDoc.getStore({ id: refDoc.id }).getBlock(refBlockId)?.model
                .flavour
            : undefined;
          if (!found || targetFlavour !== 'affine:database') {
            toast(std.host, 'The referenced table could not be found.');
          }
        })
        .catch(() => {
          // best-effort verification only; insertion already succeeded
        });
    }
  }

  next({
    insertedDatabaseRefBlockId: result[0],
  });
};
