import type { NoteRefBlockModel } from '@blocksuite/affine-model';
import { ensureDocLoaded } from '@blocksuite/affine-shared/utils';
import type { BlockStdScope } from '@blocksuite/std';
import type { BlockModel, Store } from '@blocksuite/store';

export interface NoteRefTarget {
  docId: string;
  blockId: string;
}

const MAX_VISITED_NOTES = 500;

function refKey(ref: NoteRefTarget): string {
  return `${ref.docId}:${ref.blockId}`;
}

/**
 * Walks up from `model` to the nearest ancestor `affine:note`, returning
 * its id — the note that will actually end up containing a `note-ref`
 * inserted at `model`'s position. Returns `null` if `model` isn't inside
 * any note (shouldn't normally happen for a real insertion point, but this
 * is also reused defensively by the picker).
 */
export function findContainingNoteId(
  store: Store,
  model: BlockModel
): string | null {
  let ancestor: BlockModel | null = model;
  while (ancestor) {
    if (ancestor.flavour === 'affine:note') return ancestor.id;
    ancestor = store.getParent(ancestor);
  }
  return null;
}

/**
 * Detects whether inserting a `note-ref` (pointing at `target`) inside
 * `containingNote` would create a circular reference — i.e. whether
 * `target`'s own transitive closure of referenced notes (following nested
 * `affine:note-ref` blocks, any number of hops, across any number of docs)
 * ever reaches back to `containingNote` itself.
 *
 * No such check existed before this — `noteRefSlashMenuConfig`'s own
 * comment previously claimed "a deeper cycle... is left to the render
 * layer's existing... machinery", but that "machinery"
 * (`_getAncestorChain`/`_sameChain` in `note-ref-block.ts`) is a
 * cache-invalidation check, not cycle detection at all; nothing anywhere
 * in `note-ref`/`database-ref`/`surface-ref` actually detected a real
 * reference cycle prior to this. Left unaddressed, a genuine cycle (or even
 * a long transitive chain) would recurse through nested `BlockStdScope`
 * construction without bound the moment it's ever rendered (`renderBlock`'s
 * cross-doc branch has no depth/recursion guard) — this closes the gap at
 * the point where it's cheapest to stop: before the reference is ever
 * created.
 *
 * Bounded to `MAX_VISITED_NOTES` distinct notes as a safety valve against
 * pathological/huge reference graphs — a workspace with that many *distinct*
 * notes transitively reachable from a single reference target is not a
 * realistic case in practice, and erring toward "assume no cycle" past the
 * bound is safer than hanging the UI on every reference-insertion attempt.
 */
export function wouldCreateReferenceCycle(
  std: BlockStdScope,
  containingNote: NoteRefTarget,
  target: NoteRefTarget
): boolean {
  const containingKey = refKey(containingNote);
  if (refKey(target) === containingKey) return true;

  const visited = new Set<string>([refKey(target)]);
  const queue: NoteRefTarget[] = [target];

  while (queue.length && visited.size < MAX_VISITED_NOTES) {
    const current = queue.shift();
    if (!current) break;

    const doc = std.workspace.getDoc(current.docId);
    if (!doc) continue;
    ensureDocLoaded(doc);
    const store = doc.getStore({ id: current.docId });
    const noteModel = store.getBlock(current.blockId)?.model;
    if (!noteModel) continue;

    for (const refBlock of store.getBlocksByFlavour('affine:note-ref')) {
      const refModel = refBlock.model as NoteRefBlockModel;

      // Only note-refs that live *inside* this note's own subtree count as
      // outgoing edges from it — a reference elsewhere in the same doc
      // that merely points at this note isn't part of *this* note's own
      // content.
      let ancestor: BlockModel | null = store.getParent(refModel);
      let insideCurrentNote = false;
      while (ancestor) {
        if (ancestor.id === current.blockId) {
          insideCurrentNote = true;
          break;
        }
        ancestor = store.getParent(ancestor);
      }
      if (!insideCurrentNote) continue;

      const next: NoteRefTarget = {
        docId: refModel.props.refDocId || current.docId,
        blockId: refModel.props.refBlockId,
      };
      const nextKey = refKey(next);
      if (nextKey === containingKey) return true;
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push(next);
    }
  }

  return false;
}
