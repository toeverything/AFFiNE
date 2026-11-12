import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import { toast } from '@blocksuite/affine-components/toast';
import { NoteBlockModel, NoteDisplayMode } from '@blocksuite/affine-model';
import {
  ActionPlacement,
  NoteMoveProvider,
  NotificationProvider,
  SidebarExtensionIdentifier,
  type ToolbarAction,
  type ToolbarContext,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { Bound } from '@blocksuite/global/gfx';
import {
  AutoHeightIcon,
  CustomizedHeightIcon,
  EditIcon,
  InsertIntoPageIcon,
  MoveToIcon,
  ScissorsIcon,
} from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { computed } from '@preact/signals-core';
import { html } from 'lit';

import { changeNoteDisplayMode } from '../commands';
import { NoteConfigExtension } from '../config';

const trackBaseProps = {
  category: 'note',
};

const builtinSurfaceToolbarConfig = {
  actions: [
    {
      id: 'a.show-in',
      when(ctx) {
        return (
          ctx.getSurfaceModelsByType(NoteBlockModel).length === 1 &&
          ctx.features.getFlag('enable_advanced_block_visibility')
        );
      },
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(NoteBlockModel);
        if (!models.length) return null;

        const firstModel = models[0];
        const { displayMode } = firstModel.props;
        const onSelect = (e: CustomEvent<NoteDisplayMode>) => {
          e.stopPropagation();

          const newMode = e.detail;
          setDisplayMode(ctx, firstModel, newMode);
        };

        return html`
          <edgeless-note-display-mode-dropdown-menu
            @select=${onSelect}
            .displayMode="${displayMode}"
          >
          </edgeless-note-display-mode-dropdown-menu>
        `;
      },
    },
    {
      id: 'b.display-in-page',
      when(ctx) {
        const elements = ctx.getSurfaceModelsByType(NoteBlockModel);
        return (
          elements.length === 1 &&
          !elements[0].isPageBlock() &&
          !ctx.features.getFlag('enable_advanced_block_visibility')
        );
      },
      generate(ctx) {
        const models = ctx.getSurfaceModelsByType(NoteBlockModel);
        if (!models.length) return null;

        const firstModel = models[0];
        const shouldShowTooltip$ = computed(
          () =>
            firstModel.props.displayMode$.value ===
            NoteDisplayMode.DocAndEdgeless
        );
        const label$ = computed(() =>
          firstModel.props.displayMode$.value === NoteDisplayMode.EdgelessOnly
            ? 'Display in Page'
            : 'Displayed in Page'
        );
        const onSelect = () => {
          const newMode =
            firstModel.props.displayMode === NoteDisplayMode.EdgelessOnly
              ? NoteDisplayMode.DocAndEdgeless
              : NoteDisplayMode.EdgelessOnly;
          setDisplayMode(ctx, firstModel, newMode);

          ctx.track('BlockCreated', {
            page: 'whiteboard editor',
            module: 'toolbar',
            segment: 'toolbar',
            blockType: 'affine:note',
            control: 'toolbar:general',
            other: `display in page: ${newMode === NoteDisplayMode.EdgelessOnly ? 'off' : 'on'}`,
          });
        };

        return {
          content: html`<editor-icon-button
            aria-label="${label$.value}"
            .showTooltip="${shouldShowTooltip$.value}"
            .tooltip="${'This note is part of Page Mode. Click to remove it from the page.'}"
            data-testid="display-in-page"
            @click=${() => onSelect()}
          >
            ${InsertIntoPageIcon()}
            <span class="label">${label$.value}</span>
          </editor-icon-button>`,
        };
      },
    },
    {
      // Added for Story 0.6 (reusable-note referencing): a Note otherwise
      // has no identifying title/name property at all (unlike Frame or
      // Database). This edits the same `props.name` a `note-ref` pointing
      // at this note also edits from its own toolbar
      // (`blocks/note-ref/src/configs/toolbar.ts`) — renaming from either
      // place stays in sync, since both write the same underlying prop.
      //
      // Moved into the "..." More menu (Story 0.5, per direct user
      // request), positioned above the "Frame section"/"Group section"
      // group (`Z.a.selection` in `root/src/edgeless/configs/toolbar/
      // more.ts`) — More-menu items are ordered by string-sorting their
      // `id` across every contributing toolbar module, so `A.rename` (a
      // capital letter, sorting before the shared file's `Z.`-prefixed
      // groups) lands at the very top. Kept as a quick top-level action
      // *in addition to* the fuller "Properties" panel's own name field
      // (`_renderNoteProperties`, `properties-modal.ts`) rather than only
      // living there — per the user's own reasoning, Properties is an
      // "advanced" view that everyday use shouldn't require opening.
      //
      // Uses `NotificationProvider.prompt()` (a real modal dialog) rather
      // than `content()` + `<editor-menu-button>` — More-menu items render
      // via `renderMenuActionItem` (`widgets/toolbar/src/utils.ts`), which
      // only supports a plain icon+label+`run()` click, not a `content()`
      // dropdown at all. This also sidesteps the exact off-screen-popup bug
      // the previous `content()`-based version of this action itself fixed
      // (an even *earlier* version anchored an imperative `createPopup` to
      // the whole block element and rendered invisibly off-screen) — a
      // proper modal has no anchor-positioning to get wrong in the first
      // place.
      id: 'A.rename',
      label: 'Name',
      tooltip: 'Name this note',
      icon: EditIcon(),
      placement: ActionPlacement.More,
      when(ctx) {
        return ctx.getSurfaceModelsByType(NoteBlockModel).length === 1;
      },
      run(ctx) {
        const models = ctx.getSurfaceModelsByType(NoteBlockModel);
        const model = models[0];
        if (!model) return;

        const notification = ctx.std.getOptional(NotificationProvider);
        if (!notification) return;

        notification
          .prompt({
            title: 'Name this note',
            message: '',
            autofill: model.props.name ?? '',
            placeholder: 'Name this note…',
            confirmText: 'Save',
            cancelText: 'Cancel',
          })
          .then(value => {
            // `null` means the user cancelled — leave the name untouched.
            if (value === null) return;
            ctx.store.updateBlock(model, { name: value || undefined });
          })
          .catch(e => {
            console.error('[note] failed to rename note', e);
          });
      },
    } satisfies ToolbarAction,
    {
      // Story 0.5: lets the user relocate a Note into a different,
      // already-existing doc — the manual counterpart to
      // `rescueReferencedNotesBeforeDelete`'s automatic on-delete rescue
      // (Story 0.6), sharing the same underlying `DocsService.
      // relocateNoteToAnotherDoc` relocation logic (see that method's own
      // doc comment). Bridged to the app layer via `NoteMoveProvider`
      // (`patchNoteMoveService`), the same pattern `CrossDocReferenceProvider`
      // already uses to reach the real QuickSearch dialog — this block
      // package has no direct access to app-layer services like
      // `DocsService` or the QuickSearch UI.
      //
      // Moved into the "..." More menu, positioned directly above
      // "Properties" (`d.z.properties` in `more.ts`) — `d.y.move-to` sorts
      // after that file's `d.waypoints` group but before its
      // `d.z.properties`, per the same string-sort-by-`id` ordering.
      id: 'd.y.move-to',
      label: 'Move to page...',
      tooltip: 'Move to another page',
      icon: MoveToIcon(),
      placement: ActionPlacement.More,
      when(ctx) {
        return (
          ctx.getSurfaceModelsByType(NoteBlockModel).length === 1 &&
          !!ctx.std.getOptional(NoteMoveProvider)
        );
      },
      run(ctx) {
        const models = ctx.getSurfaceModelsByType(NoteBlockModel);
        const model = models[0];
        if (!model) return;

        const noteMove = ctx.std.getOptional(NoteMoveProvider);
        if (!noteMove) return;

        noteMove
          .moveNoteToAnotherDoc(model.id, ctx.store.id)
          .then(moved => {
            if (moved) {
              ctx.reset();
            }
            // A `false` result covers both "cancelled the picker" and "the
            // move itself failed" — neither is worth a toast for a plain
            // cancel, but there's no way to tell them apart from here, and
            // erring toward silence on cancel is the friendlier default.
          })
          .catch(e => {
            console.error('[note] failed to move note to another doc', e);
            toast(ctx.host, 'Could not move this note.');
          });
      },
    } satisfies ToolbarAction,
    {
      // Restored to the main toolbar row (not the "..." More menu) per
      // direct user request after the Story 0.5 reorg — Properties
      // (`_renderNoteProperties`, `properties-modal.ts`) is meant to be a
      // full flat list of every property in one place, not the only way to
      // reach any of them; quick-access style editing (this dropdown) and
      // the fuller Properties panel are two different, both-useful views
      // onto the same underlying `props.background`/`props.edgeless`, same
      // as Frame/Shape's own toolbar buttons coexist with their Properties
      // rows.
      id: 'd.style',
      when(ctx) {
        const elements = ctx.getSurfaceModelsByType(NoteBlockModel);
        return (
          elements.length > 0 &&
          elements[0].props.displayMode !== NoteDisplayMode.DocOnly
        );
      },
      actions: [
        {
          id: 'b.style',
          when: ctx => {
            const models = ctx.getSurfaceModels();
            return (
              models.length > 0 &&
              models.every(model => model instanceof NoteBlockModel)
            );
          },
          content(ctx) {
            const notes = ctx.getSurfaceModelsByType(NoteBlockModel);
            return html`<edgeless-note-style-panel
              .notes=${notes}
              .std=${ctx.std}
            ></edgeless-note-style-panel>`;
          },
        } satisfies ToolbarAction,
      ],
    },
    {
      id: 'e.slicer',
      label: 'Slicer',
      icon: ScissorsIcon(),
      tooltip: html`<affine-tooltip-content-with-shortcut
        data-tip="${'Cutting mode'}"
        data-shortcut="${'-'}"
      ></affine-tooltip-content-with-shortcut>`,
      active: false,
      when(ctx) {
        return (
          ctx.getSurfaceModelsByType(NoteBlockModel).length === 1 &&
          ctx.features.getFlag('enable_advanced_block_visibility')
        );
      },
      run(ctx) {
        ctx.std.get(EdgelessLegacySlotIdentifier).toggleNoteSlicer.next();
      },
    },
    {
      id: 'f.auto-height',
      label: 'Size',
      when(ctx) {
        const elements = ctx.getSurfaceModelsByType(NoteBlockModel);
        return (
          elements.length > 0 &&
          (!elements[0].isPageBlock() ||
            !ctx.std.getOptional(NoteConfigExtension.identifier)
              ?.edgelessNoteHeader)
        );
      },
      generate(ctx) {
        const models = ctx.getSurfaceModelsByType(NoteBlockModel);
        if (!models.length) return null;

        const firstModel = models[0];
        const { collapse } = firstModel.props.edgeless$.value;
        const options: Pick<ToolbarAction, 'tooltip' | 'icon'> = collapse
          ? {
              tooltip: 'Auto height',
              icon: AutoHeightIcon(),
            }
          : {
              tooltip: 'Customized height',
              icon: CustomizedHeightIcon(),
            };

        return {
          ...options,
          run(ctx) {
            ctx.store.captureSync();

            for (const model of models) {
              const edgeless = model.props.edgeless;

              if (edgeless.collapse) {
                ctx.store.updateBlock(model, () => {
                  model.props.edgeless.collapse = false;
                });
                continue;
              }

              if (edgeless.collapsedHeight) {
                const bounds = Bound.deserialize(model.xywh);
                bounds.h = edgeless.collapsedHeight * (edgeless.scale ?? 1);
                const xywh = bounds.serialize();

                ctx.store.updateBlock(model, () => {
                  model.xywh = xywh;
                  model.props.edgeless.collapse = true;
                });
              }
            }
          },
        };
      },
    },
    {
      id: 'g.scale',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(NoteBlockModel);
        if (!models.length) return null;

        const firstModel = models[0];
        const scale$ = computed(() => {
          const scale = firstModel.props.edgeless$.value.scale ?? 1;
          return Math.round(100 * scale);
        });
        const onSelect = (e: CustomEvent<number>) => {
          e.stopPropagation();

          const scale = e.detail / 100;

          models.forEach(model => {
            const bounds = Bound.deserialize(model.xywh);
            const oldScale = model.props.edgeless.scale ?? 1;
            const ratio = scale / oldScale;
            bounds.w *= ratio;
            bounds.h *= ratio;
            const xywh = bounds.serialize();

            ctx.store.updateBlock(model, () => {
              model.xywh = xywh;
              model.props.edgeless.scale = scale;
            });
          });

          ctx.track('SelectedCardScale', {
            ...trackBaseProps,
            control: 'select card scale',
          });
        };
        const onToggle = (e: CustomEvent<boolean>) => {
          e.stopPropagation();

          const opened = e.detail;
          if (!opened) return;

          ctx.track('OpenedCardScaleSelector', {
            ...trackBaseProps,
            control: 'switch card scale',
          });
        };
        const format = (value: number) => `${value}%`;

        return html`<affine-size-dropdown-menu
          @select=${onSelect}
          @toggle=${onToggle}
          .format=${format}
          .sizeSignal=${scale$}
        ></affine-size-dropdown-menu>`;
      },
    },
  ],

  when: ctx => ctx.getSurfaceModelsByType(NoteBlockModel).length > 0,
} as const satisfies ToolbarModuleConfig;

function setDisplayMode(
  ctx: ToolbarContext,
  model: NoteBlockModel,
  newMode: NoteDisplayMode
) {
  const displayMode = model.props.displayMode;

  ctx.command.exec(changeNoteDisplayMode, {
    noteId: model.id,
    mode: newMode,
    stopCapture: true,
  });

  // if change note to page only, should clear the selection
  if (newMode === NoteDisplayMode.DocOnly) {
    ctx.selection.clear();
  }

  const data =
    newMode === NoteDisplayMode.EdgelessOnly
      ? {
          title: 'Note removed from Page Mode',
          message: 'Content removed from your page.',
        }
      : {
          title: 'Note displayed in Page Mode',
          message: 'Content added to your page.',
        };

  const notification = ctx.std.getOptional(NotificationProvider);
  notification?.notifyWithUndoAction({
    title: data.title,
    message: `${data.message} Find it in the TOC for quick navigation.`,
    accent: 'success',
    duration: 5 * 1000,
    actions: [
      {
        key: 'view-in-toc',
        label: 'View in Toc',
        onClick: () => {
          const sidebar = ctx.std.getOptional(SidebarExtensionIdentifier);
          sidebar?.open('outline');
        },
      },
    ],
  });

  ctx.track('NoteDisplayModeChanged', {
    ...trackBaseProps,
    control: 'display mode',
    other: `from ${displayMode} to ${newMode}`,
  });
}

export const createBuiltinToolbarConfigExtension = (
  flavour: string
): ExtensionType[] => {
  const name = flavour.split(':').pop();

  return [
    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(`affine:surface:${name}`),
      config: builtinSurfaceToolbarConfig,
    }),
  ];
};
