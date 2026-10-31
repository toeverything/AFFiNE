import { Bound } from '@blocksuite/global/gfx';
import type {
  GfxCompatibleProps,
  GfxElementGeometry,
} from '@blocksuite/std/gfx';
import { GfxCompatible } from '@blocksuite/std/gfx';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';
import { z } from 'zod';

import {
  DEFAULT_NOTE_BORDER_SIZE,
  DEFAULT_NOTE_BORDER_STYLE,
  DEFAULT_NOTE_CORNER,
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_SHADOW,
  DEFAULT_NOTE_WIDTH,
  NoteDisplayMode,
  NoteDisplayModeSchema,
  NoteShadowsSchema,
  type StrokeStyle,
  StrokeStyleSchema,
} from '../../consts/note';
import { type Color, ColorSchema, DefaultTheme } from '../../themes';

export const NoteZodSchema = z
  .object({
    background: ColorSchema,
    displayMode: NoteDisplayModeSchema,
    edgeless: z.object({
      style: z.object({
        borderRadius: z.number(),
        borderSize: z.number(),
        borderStyle: StrokeStyleSchema,
        shadowType: NoteShadowsSchema,
      }),
    }),
    // Workspace-level defaults for freshly created notes (Settings ->
    // Editor -> Note) — distinct from the per-instance override on the
    // note itself (`NoteProps.pageBorder`/`pageBackgroundOverride`), which
    // always wins once set. `pageBorder` defaults `true` here (matching
    // the same default a note with no explicit override already resolves
    // to, per `NoteBlockComponent._showBorder`) so the setting reads as
    // "on" out of the box rather than looking already-overridden to off.
    //
    // Both need a *field-level* `.default(...)`, not just the whole
    // object's own `.default({...})` below — that outer default only
    // covers the case where the entire `'affine:note'` settings value is
    // itself `undefined`. Any already-persisted settings object from
    // before these two fields existed is a *partial* object (has
    // `background`/`displayMode`/`edgeless`, missing these two) — zod
    // requires every non-optional field on a present object, so parsing
    // that old data would otherwise throw outright, breaking the entire
    // per-flavour settings/last-used-style persistence for `affine:note`
    // (not just these two new fields) the moment it was read back.
    pageBorder: z.boolean().default(true),
    pageBackgroundOverride: ColorSchema.optional(),
  })
  .default({
    background: DefaultTheme.noteBackgrounColor,
    displayMode: NoteDisplayMode.EdgelessOnly,
    edgeless: {
      style: {
        borderRadius: DEFAULT_NOTE_CORNER,
        borderSize: DEFAULT_NOTE_BORDER_SIZE,
        borderStyle: DEFAULT_NOTE_BORDER_STYLE,
        shadowType: DEFAULT_NOTE_SHADOW,
      },
    },
    pageBorder: true,
    pageBackgroundOverride: undefined,
  });

export const NoteBlockSchema = defineBlockSchema({
  flavour: 'affine:note',
  props: (): NoteProps => ({
    xywh: `[0,0,${DEFAULT_NOTE_WIDTH},${DEFAULT_NOTE_HEIGHT}]`,
    background: DefaultTheme.noteBackgrounColor,
    index: 'a0',
    lockedBySelf: false,
    hidden: false,
    displayMode: NoteDisplayMode.DocAndEdgeless,
    edgeless: {
      style: {
        borderRadius: DEFAULT_NOTE_CORNER,
        borderSize: DEFAULT_NOTE_BORDER_SIZE,
        borderStyle: DEFAULT_NOTE_BORDER_STYLE,
        shadowType: DEFAULT_NOTE_SHADOW,
      },
    },
    comments: undefined,
    name: undefined,
    pageBorder: undefined,
    pageBackgroundOverride: undefined,
  }),
  metadata: {
    version: 1,
    role: 'hub',
    parent: ['@root'],
    children: [
      '@content',
      'affine:database',
      'affine:data-view',
      'affine:callout',
    ],
  },
  toModel: () => {
    return new NoteBlockModel();
  },
});

export const NoteBlockSchemaExtension = BlockSchemaExtension(NoteBlockSchema);
export type NoteProps = {
  background: Color;
  displayMode: NoteDisplayMode;
  edgeless: NoteEdgelessProps;
  comments?: Record<string, boolean>;
  // Optional, user-set label — added for Story 0.6's reusable-note-reference
  // picker/toolbar, since a Note otherwise has no identifying title/name
  // property at all (unlike Frame or Database). Set from either the note's
  // own edgeless toolbar or a `note-ref` pointing at it — both edit this
  // same underlying prop, so renaming from either place stays in sync.
  name?: string;
  // Page-mode display style — deliberately distinct from `background`
  // above, which is this note's *edgeless* canvas box color. `undefined`
  // (the default for every note, including the doc's own primary one) means
  // "use the derived default": no border for the primary page note (it IS
  // the page), a border for any other note shown in page flow, so it reads
  // as a distinct block rather than blending invisibly into surrounding
  // text (`NoteBlockComponent._showBorder`, `note-block.ts`). Explicitly
  // set `true`/`false` to override that default either way.
  pageBorder?: boolean;
  // Theme-aware, same `Color` type/palette `background` above uses (edited
  // via the same "Note Style" panel, `edgeless-note-style-panel.ts`'s new
  // "In-page background color" row, right after "Fill color") —
  // `undefined` means no override, letting the page's own background
  // (white, ordinarily) show through.
  pageBackgroundOverride?: Color;
  /**
   * @deprecated
   * use `displayMode` instead
   * hidden:true -> displayMode:NoteDisplayMode.EdgelessOnly:
   *  means the note is visible only in the edgeless mode
   * hidden:false -> displayMode:NoteDisplayMode.DocAndEdgeless:
   *  means the note is visible in the doc and edgeless mode
   */
  hidden: boolean;
} & GfxCompatibleProps;

export type NoteEdgelessProps = {
  style: {
    borderRadius: number;
    borderSize: number;
    borderStyle: StrokeStyle;
    shadowType: string;
  };
  collapse?: boolean;
  collapsedHeight?: number;
  scale?: number;
};

export class NoteBlockModel
  extends GfxCompatible<NoteProps>(BlockModel)
  implements GfxElementGeometry
{
  private _isSelectable(): boolean {
    return this.props.displayMode !== NoteDisplayMode.DocOnly;
  }

  override containsBound(bounds: Bound): boolean {
    if (!this._isSelectable()) return false;
    return super.containsBound(bounds);
  }

  override includesPoint(x: number, y: number): boolean {
    if (!this._isSelectable()) return false;

    const bound = Bound.deserialize(this.xywh);
    return bound.isPointInBound([x, y], 0);
  }

  override intersectsBound(bound: Bound): boolean {
    if (!this._isSelectable()) return false;
    return super.intersectsBound(bound);
  }

  override isEmpty(): boolean {
    if (this.children.length === 0) return true;
    if (this.children.length === 1) {
      const firstChild = this.children[0];
      if (firstChild.flavour === 'affine:paragraph') {
        return firstChild.isEmpty();
      }
    }
    return false;
  }

  /**
   * We define a note block as a page block if it is the first visible note
   */
  isPageBlock() {
    return (
      this.parent?.children.find(
        child =>
          child instanceof NoteBlockModel &&
          child.props.displayMode !== NoteDisplayMode.EdgelessOnly
      ) === this
    );
  }
}
