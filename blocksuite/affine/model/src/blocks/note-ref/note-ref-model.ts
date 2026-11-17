import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

import type { Color } from '../../themes';

/**
 * A reference to a single `affine:note` block, addressed by stable id —
 * lets a reusable block of text (a "note" in the everyday sense: a
 * checklist, a shared snippet) be written once and embedded live, in
 * place, editable, from any number of other spots.
 *
 * Unlike `affine:database-ref`, no promotion step is needed: `affine:note`'s
 * own schema already permits `parent: ['@root']`, so a secondary Note is
 * independently valid the moment it's created — there's no "first reference
 * is free, second reference triggers relocation" dance, and correspondingly
 * no orphan-cleanup responsibility on delete (see `Story 0.6`'s Dev Notes).
 *
 * `refDocId` is optional and defaults to the current doc when absent —
 * Story 0.6 only exercises the same-doc case; a future story wires up
 * genuine cross-doc resolution when a real foreign `refDocId` is set,
 * mirroring how `database-ref` grew cross-doc support in Story 0.3 after
 * shipping same-doc-only in Story 0.2.
 */
export type NoteRefProps = {
  refBlockId: string;
  refDocId?: string;
  // Per-instance display overrides — deliberately NOT read from the
  // canonical Note's own props (the canonical stays a hidden `EdgelessOnly`
  // note purely for data storage; its own page-mode props are never
  // rendered directly). Defaults to a visible border so a reader can tell
  // where the embedded note starts and ends within the surrounding flow.
  //
  // Stored as a `Color` (the same theme-token type `NoteProps.
  // pageBackgroundOverride` uses), never a resolved CSS string — a
  // resolved value bakes in whichever light/dark scheme happened to be
  // active at the moment it was picked, so switching themes later would
  // leave every note-ref showing the *other* scheme's color forever.
  // Resolve via `resolveColor(backgroundOverride, theme)` at render time
  // instead, exactly like `note-block.ts`'s own `_pageBackgroundOverride`.
  showBorder: boolean;
  backgroundOverride?: Color;
};

// Naming lives on the canonical `affine:note` itself (`NoteProps.name`), not
// here — a reference has no identity of its own worth naming separately
// from what it points at, and putting it on the canonical means renaming
// from either the note-ref's own toolbar or the canonical note's edgeless
// toolbar edits the same value, staying in sync automatically.
export const NoteRefBlockSchema = defineBlockSchema({
  flavour: 'affine:note-ref',
  props: (): NoteRefProps => ({
    refBlockId: '',
    refDocId: undefined,
    showBorder: true,
    backgroundOverride: undefined,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:note', 'affine:paragraph', 'affine:list'],
  },
  toModel: () => new NoteRefBlockModel(),
});

export const NoteRefBlockSchemaExtension =
  BlockSchemaExtension(NoteRefBlockSchema);

export class NoteRefBlockModel extends BlockModel<NoteRefProps> {}
