import { toast } from '@blocksuite/affine-components/toast';
import { EditorChevronDown } from '@blocksuite/affine-components/toolbar';
import { NoteRefBlockModel } from '@blocksuite/affine-model';
import {
  ActionPlacement,
  NoteMoveProvider,
  type ToolbarAction,
  type ToolbarActionGroup,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import {
  DeleteIcon,
  EditIcon,
  MoveToIcon,
  PaletteIcon,
} from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { cssVarV2 } from '@toeverything/theme/v2';
import { html } from 'lit';
import { repeat } from 'lit/directives/repeat.js';

/**
 * Matches Frame's own "Frame Size" icon (`frame-toolbar.ts`'s private,
 * unexported `FrameSizeIcon`) — a plain rounded-rect outline reads as "this
 * toggles a border" far more clearly than the generic `ViewBarIcon` this
 * used before.
 */
function BorderToggleIcon() {
  return html`<svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="2"
      y="2"
      width="16"
      height="16"
      rx="3"
      stroke="currentColor"
      stroke-width="1.5"
      fill="none"
    />
  </svg>`;
}

// Naming lives on the canonical `affine:note` itself (`NoteProps.name`), not
// on the reference — so renaming here edits the SAME underlying prop the
// canonical note's own edgeless toolbar rename action edits
// (`blocks/note/src/configs/toolbar.ts`), staying in sync regardless of
// which one you use, and regardless of how many other references exist.
//
// Rendered via `content()` + `<editor-menu-button>` (matching
// `backgroundColorAction` below), not an imperative `createPopup(
// popupTargetFromElement(blockElement), ...)` call — an earlier version did
// exactly that, anchoring the popup to the whole `affine-note-ref` block
// element. Floating-ui's `computePosition` had no sensible way to place a
// small popup relative to that anchor and put it far off-screen (confirmed
// live: the input rendered at `y: -1131`) — invisible, but still real and
// connected, so focusing it scrolled the page toward its position, which is
// what looked like "clicking rename just jumps to the top of the page and
// opens nothing". `editor-menu-button` sidesteps this entirely by anchoring
// its popper to its own trigger button (the icon actually clicked), the
// same mechanism every other working toolbar dropdown in this codebase
// already relies on.
//
// Icon: `EditIcon`, not the previous `CaptionIcon` — matches Frame's own
// rename action (`frame-toolbar.ts`'s `c.rename`, the closest existing
// precedent for "rename an edgeless-adjacent element"), which already uses
// `EditIcon`. `CaptionIcon` reads as "caption/subtitle", not "rename".
const renameAction = {
  id: 'a.rename',
  run() {
    // Handled by content() below.
  },
  content(ctx) {
    const model = ctx.getCurrentModelByType(NoteRefBlockModel);
    if (!model) return null;

    const canonical = ctx.store.getBlock(model.props.refBlockId)?.model;
    if (!canonical) return null;
    const canonicalName = (canonical as { props: { name?: string } }).props
      .name;

    const commit = (value: string) => {
      ctx.store.updateBlock(canonical, { name: value || undefined });
    };

    return html`
      <editor-menu-button
        .contentPadding=${'8px'}
        .button=${html`
          <editor-icon-button aria-label="rename" .tooltip=${'Name this note'}>
            ${EditIcon()}
          </editor-icon-button>
        `}
      >
        <input
          style="padding: 8px 12px; border: none; outline: none; width: 220px; font: inherit; background: ${cssVarV2
            .layer.background.overlayPanel};"
          .value=${canonicalName ?? ''}
          placeholder="Name this note…"
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Enter') {
              commit((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            }
          }}
          @blur=${(e: FocusEvent) =>
            commit((e.target as HTMLInputElement).value)}
          @click=${stopPropagation}
          @pointerdown=${stopPropagation}
        />
      </editor-menu-button>
    `;
  },
} satisfies ToolbarAction;

const showBorderAction = {
  id: 'b.show-border',
  tooltip: 'Toggle border',
  icon: BorderToggleIcon(),
  run(ctx) {
    const model = ctx.getCurrentModelByType(NoteRefBlockModel);
    if (!model) return;
    ctx.store.updateBlock(model, { showBorder: !model.props.showBorder });
  },
} satisfies ToolbarAction;

const backgroundColors = [
  { name: 'None', value: undefined },
  { name: 'Grey', value: cssVarV2.block.callout.background.grey },
  { name: 'Blue', value: 'var(--affine-tag-blue)' },
  { name: 'Green', value: 'var(--affine-tag-green)' },
  { name: 'Yellow', value: 'var(--affine-tag-yellow)' },
  { name: 'Red', value: 'var(--affine-tag-red)' },
] as const;

const backgroundColorAction = {
  id: 'c.background-color',
  label: 'Background Color',
  tooltip: 'Change background color',
  icon: PaletteIcon(),
  run() {
    // Handled by content() below, mirrors callout's own toolbar pattern.
  },
  content(ctx) {
    const model = ctx.getCurrentModelByType(NoteRefBlockModel);
    if (!model) return null;

    const setColor = (value: string | undefined) => {
      ctx.store.updateBlock(model, { backgroundOverride: value });
    };

    return html`
      <editor-menu-button
        .contentPadding=${'8px'}
        .button=${html`
          <editor-icon-button
            aria-label="background"
            .tooltip=${'Background Color'}
          >
            ${PaletteIcon()} ${EditorChevronDown}
          </editor-icon-button>
        `}
      >
        <div data-size="large" data-orientation="vertical">
          ${repeat(
            backgroundColors,
            c => c.name,
            c => html`
              <editor-menu-action @click=${() => setColor(c.value)}>
                <span class="label">${c.name}</span>
              </editor-menu-action>
            `
          )}
        </div>
      </editor-menu-button>
    `;
  },
} satisfies ToolbarAction;

// Story 0.5: lets the user relocate the *canonical* note this reference
// points at — not the reference itself — into a different, already-existing
// doc. Mirrors `blocks/note/src/configs/toolbar.ts`'s own "Move to another
// page" action exactly (same `NoteMoveProvider` bridge, same underlying
// `DocsService.relocateNoteToAnotherDoc`), operating on `refBlockId`/
// `refDocId` instead of the reference's own model id — moving a note you're
// currently viewing/editing via a reference shouldn't require first
// navigating to wherever the canonical happens to live.
const moveToAction = {
  id: 'd.move-to',
  placement: ActionPlacement.More,
  label: 'Move to page...',
  tooltip: 'Move to another page',
  icon: MoveToIcon(),
  when(ctx) {
    return !!ctx.std.getOptional(NoteMoveProvider);
  },
  run(ctx) {
    const model = ctx.getCurrentModelByType(NoteRefBlockModel);
    if (!model) return;

    const noteMove = ctx.std.getOptional(NoteMoveProvider);
    if (!noteMove) return;

    noteMove
      .moveNoteToAnotherDoc(
        model.props.refBlockId,
        model.props.refDocId || ctx.store.id
      )
      .catch(e => {
        console.error('[note-ref] failed to move referenced note', e);
        toast(ctx.host, 'Could not move this note.');
      });
  },
} satisfies ToolbarAction;

const builtinToolbarConfig = {
  actions: [
    // Rename, border, and background all live in one group (not three)
    // so they render as one adjacent cluster with no divider between
    // them — an earlier version split rename into its own group, which
    // added a visible gap/separator between it and the border/background
    // icons for no real reason (all three are equally "quick style
    // settings" for this reference, not conceptually distinct groups).
    {
      id: 'style',
      actions: [renameAction, showBorderAction, backgroundColorAction],
    } satisfies ToolbarActionGroup<ToolbarAction>,
    moveToAction,
    {
      placement: ActionPlacement.More,
      id: 'z.delete',
      label: 'Delete',
      icon: DeleteIcon(),
      variant: 'destructive',
      run(ctx) {
        const model = ctx.getCurrentModelByType(NoteRefBlockModel);
        if (!model) return;
        ctx.store.deleteBlock(model);
        ctx.select('note');
        ctx.reset();
      },
    } satisfies ToolbarAction,
  ],
} as const satisfies ToolbarModuleConfig;

export const createNoteRefBuiltinToolbarConfigExtension = (
  flavour: string
): ExtensionType[] => {
  return [
    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(flavour),
      config: builtinToolbarConfig,
    }),
  ];
};
