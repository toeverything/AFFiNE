import { toast } from '@blocksuite/affine-components/toast';
import type { NoteProps, NoteRefProps } from '@blocksuite/affine-model';
import { NoteDisplayMode, resolveColor } from '@blocksuite/affine-model';
import {
  EditPropsStore,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import {
  ensureDocLoaded,
  waitForBlockInDoc,
} from '@blocksuite/affine-shared/utils';
import { Bound } from '@blocksuite/global/gfx';
import type { BlockStdScope, Command } from '@blocksuite/std';
import type { GfxController } from '@blocksuite/std/gfx';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';

import { findContainingNoteId, wouldCreateReferenceCycle } from './cycle';

/**
 * A newly created `note-ref` should look the way a newly created
 * page-visible note would — same border/background — since neither the
 * canonical Note itself (always `EdgelessOnly`, whose own `pageBorder`/
 * `pageBackgroundOverride` render-time logic explicitly ignores `EdgelessOnly`
 * notes entirely — see `NoteBlockComponent._showBorder`/
 * `_pageBackgroundOverride`) nor a bare schema default has any awareness of
 * Settings -> Editor -> Note. Reads the same `'affine:note'` settings a
 * freshly created canonical note's own `pageBorder`/`pageBackgroundOverride`
 * are seeded from (`EditPropsStore.applyLastProps`), resolving the
 * theme-aware `Color` value to a plain CSS string via `resolveColor` — the
 * exact same resolution `note-block.ts`'s own rendering does — since
 * `note-ref`'s `backgroundOverride` is a plain CSS string, not the `Color`
 * type `NoteProps.pageBackgroundOverride` uses.
 */
function resolveNoteRefStyleDefaults(std: BlockStdScope): {
  showBorder: boolean;
  backgroundOverride: string | undefined;
} {
  const noteDefaults = std
    .get(EditPropsStore)
    .applyLastProps('affine:note', {}) as Partial<NoteProps>;
  const backgroundOverride = noteDefaults.pageBackgroundOverride
    ? resolveColor(
        noteDefaults.pageBackgroundOverride,
        std.get(ThemeProvider).appTheme
      )
    : undefined;
  return {
    showBorder: noteDefaults.pageBorder ?? true,
    backgroundOverride,
  };
}

const NOTE_WIDTH = 400;
const NOTE_HEIGHT = 200;
const NOTE_GAP = 20;

/**
 * A simple, local collision-avoidance loop: nudge rightward by one note-width
 * at a time until the candidate bound no longer overlaps any existing Gfx
 * element on the surface. Not the placement mechanism used by any
 * image-to-frame import feature (asked about but not located in this
 * codebase) — just enough to stop freshly created reusable notes from
 * landing exactly on top of each other or of existing content, which a
 * plain viewport-center placement (matching Frame's own
 * `createFrameOnViewportCenter`, which itself does no collision avoidance)
 * would otherwise do every time.
 */
function findNonOverlappingBound(gfx: GfxController | undefined): Bound {
  const center = gfx?.viewport.center ?? { x: 0, y: 0 };
  let bound = new Bound(
    center.x - NOTE_WIDTH / 2,
    center.y - NOTE_HEIGHT / 2,
    NOTE_WIDTH,
    NOTE_HEIGHT
  );
  if (!gfx) return bound;

  const existingBounds = gfx.gfxElements.map(el => el.elementBound);
  let attempts = 0;
  while (
    existingBounds.some(b => bound.isOverlapWithBound(b)) &&
    attempts < 50
  ) {
    bound = new Bound(
      bound.x + NOTE_WIDTH + NOTE_GAP,
      bound.y,
      NOTE_WIDTH,
      NOTE_HEIGHT
    );
    attempts++;
  }
  return bound;
}

export const insertNoteRefBlockCommand: Command<
  {
    refBlockId: string;
    place: 'after' | 'before';
    removeEmptyLine?: boolean;
    selectedModels?: BlockModel[];
    // Set for a cross-doc reference (Story 0.5): the target Note already
    // lives in its own doc, so — like `database-ref`'s cross-doc branch —
    // no same-doc validation applies. Unset (Story 0.6's same-page case)
    // defaults to the current doc, exactly as before.
    refDocId?: string;
  },
  {
    insertedNoteRefBlockId: string;
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
    // `insertDatabaseRefBlockCommand`'s cross-doc branch, which likewise
    // trusts the caller (the cross-doc picker already validated the
    // candidate via the indexer) rather than requiring the target to be
    // synchronously resolvable at insertion time. `note-ref-block.ts`'s
    // own `_subscribeTargetDoc` already retries once the target doc's
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
    if (!targetBlock || targetBlock.flavour !== 'affine:note') {
      console.error(`referenced note block not found ${refBlockId}`);
      return;
    }
  }

  // Reject any reference whose target note transitively references (via
  // its own nested `note-ref`s, any number of hops, across any number of
  // docs) the note this new reference would itself live inside — see
  // `cycle.ts` for why this wasn't caught anywhere before and what could
  // go wrong left unchecked (unbounded nested-`BlockStdScope` recursion the
  // moment such a reference is rendered).
  const containingNoteId = findContainingNoteId(store, targetModel);
  if (containingNoteId) {
    const isCycle = wouldCreateReferenceCycle(
      std,
      { docId: store.id, blockId: containingNoteId },
      { docId: refDocId ?? store.id, blockId: refBlockId }
    );
    if (isCycle) {
      toast(std.host, 'Can’t add this reference — it would create a loop.');
      return;
    }
  }

  store.captureSync();

  const noteRefProps: Partial<NoteRefProps> & {
    flavour: 'affine:note-ref';
  } = {
    flavour: 'affine:note-ref',
    refBlockId,
    refDocId: refDocId ?? store.id,
    ...resolveNoteRefStyleDefaults(std),
  };

  const result = store.addSiblingBlocks(targetModel, [noteRefProps], place);
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
          if (!found || targetFlavour !== 'affine:note') {
            toast(std.host, 'The referenced note could not be found.');
          }
        })
        .catch(() => {
          // best-effort verification only; insertion already succeeded
        });
    }
  }

  next({
    insertedNoteRefBlockId: result[0],
  });
};

/**
 * Creates a brand-new, hidden (`EdgelessOnly`) canonical `affine:note`, then
 * inserts a `note-ref` at the invocation point pointing at it — the "start
 * a new reusable note from scratch" entry point (AC2), as opposed to
 * `insertNoteRefBlockCommand`, which references one that already exists.
 *
 * Per direct user decision (2026-07-22): a native, un-wrapped sibling note
 * (an earlier version of this command) can never have ordinary page content
 * continue after it in the *same* note's flow — `affine:note`'s own schema
 * only ever permits `parent: ['@root']`, so it's structurally always a flat
 * sibling of whatever else is on the page, never embeddable inside another
 * note's own paragraph/list flow. A `note-ref`, by contrast, has
 * `parent: ['affine:note', 'affine:paragraph', 'affine:list']` — it lives
 * *inside* the note the user invoked `/note` from, so ordinary paragraphs
 * before and after it continue completely normally, in that same note, no
 * flat-sibling limitation at all. This is the reverse of an earlier
 * decision this story made (routing `/note` through a plain native note
 * instead) — that trade was the wrong one specifically for `/note`, whose
 * whole point is inserting inline at the cursor; it remains the *right*
 * one for the edgeless "Display in Page" toggle, which is left untouched
 * for now (a separate, later decision).
 */
export const createReusableNoteAndInsertRefCommand: Command<
  {
    place: 'after' | 'before';
    removeEmptyLine?: boolean;
    selectedModels?: BlockModel[];
  },
  {
    insertedNoteRefBlockId: string;
  }
> = (ctx, next) => {
  const { selectedModels, place, removeEmptyLine, std } = ctx;
  if (!selectedModels?.length) return;

  const store = std.store;
  if (!store.root) {
    toast(std.host, 'Cannot create a reusable note: no doc root found.');
    return;
  }

  const gfx = std.getOptional(GfxControllerIdentifier) ?? undefined;
  const bound = findNonOverlappingBound(gfx);

  // Merges in the workspace-level defaults from Settings -> Editor -> Note
  // (background/border/shadow/corner radius for the canonical's own,
  // never-directly-rendered edgeless appearance) — mirrors
  // `EdgelessFrameManager._addFrameBlock`'s identical use of
  // `applyLastProps` for Frame creation.
  const noteProps = std.get(EditPropsStore).applyLastProps('affine:note', {
    xywh: bound.serialize(),
    ...(gfx ? { index: gfx.layer.generateIndex(true) } : {}),
    displayMode: NoteDisplayMode.EdgelessOnly,
  });

  const noteId = store.addBlock('affine:note', noteProps, store.root);
  store.addBlock('affine:paragraph', {}, noteId);

  const [_, result] = std.command.exec(insertNoteRefBlockCommand, {
    refBlockId: noteId,
    place,
    removeEmptyLine,
    selectedModels,
  });

  if (!result.insertedNoteRefBlockId) return;

  next({
    insertedNoteRefBlockId: result.insertedNoteRefBlockId,
  });
};
