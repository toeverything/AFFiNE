import {
  EdgelessCRUDIdentifier,
  EdgelessLegacySlotIdentifier,
} from '@blocksuite/affine-block-surface';
import {
  packColor,
  type PickColorEvent,
} from '@blocksuite/affine-components/color-picker';
import type { LineDetailType } from '@blocksuite/affine-components/edgeless-line-styles-panel';
import {
  DefaultTheme,
  NoteBlockModel,
  NoteDisplayMode,
  type NoteShadow,
  resolveColor,
} from '@blocksuite/affine-model';
import {
  NotificationProvider,
  SidebarExtensionIdentifier,
  type ToolbarAction,
  type ToolbarContext,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { getMostCommonResolvedValue } from '@blocksuite/affine-shared/utils';
import {
  BlockFlavourIdentifier,
  EditorLifeCycleExtension,
} from '@blocksuite/block-std';
import { Bound } from '@blocksuite/global/gfx';
import {
  AutoHeightIcon,
  CornerIcon,
  CustomizedHeightIcon,
  LinkedPageIcon,
  ScissorsIcon,
} from '@blocksuite/icons/lit';
import type { ExtensionType } from '@blocksuite/store';
import { computed } from '@preact/signals-core';
import { html } from 'lit';
import { keyed } from 'lit/directives/keyed.js';

import { changeNoteDisplayMode } from '../commands';
import * as styles from '../components/view-in-page-notify.css';
import { NoteConfigExtension } from '../config';

const trackBaseProps = {
  category: 'note',
};

const CORNER_LIST = [
  { key: 'None', value: 0 },
  { key: 'Small', value: 8 },
  { key: 'Medium', value: 16 },
  { key: 'Large', value: 24 },
  { key: 'Huge', value: 32 },
] as const;

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
            ? 'Display In Page'
            : 'Displayed In Page'
        );
        const onSelect = () => {
          const newMode =
            firstModel.props.displayMode === NoteDisplayMode.EdgelessOnly
              ? NoteDisplayMode.DocAndEdgeless
              : NoteDisplayMode.EdgelessOnly;
          setDisplayMode(ctx, firstModel, newMode);
        };

        return {
          content: html`<editor-icon-button
            aria-label="${label$.value}"
            .showTooltip="${shouldShowTooltip$.value}"
            .tooltip="${'This note is part of Page Mode. Click to remove it from the page.'}"
            data-testid="display-in-page"
            @click=${() => onSelect()}
          >
            ${LinkedPageIcon()}
            <span class="label">${label$.value}</span>
          </editor-icon-button>`,
        };
      },
    },
    {
      id: 'c.color-picker',
      when(ctx) {
        const elements = ctx.getSurfaceModelsByType(NoteBlockModel);
        return (
          elements.length > 0 &&
          elements[0].props.displayMode !== NoteDisplayMode.DocOnly
        );
      },
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(NoteBlockModel);
        if (!models.length) return null;

        const enableCustomColor = ctx.features.getFlag('enable_color_picker');
        const theme = ctx.theme.edgeless$.value;

        const firstModel = models[0];
        const background =
          getMostCommonResolvedValue(
            models.map(model => model.props),
            'background',
            background => resolveColor(background, theme)
          ) ?? resolveColor(DefaultTheme.noteBackgrounColor, theme);
        const onPick = (e: PickColorEvent) => {
          const field = 'background';

          if (e.type === 'pick') {
            const color = e.detail.value;
            for (const model of models) {
              const props = packColor(field, color);
              ctx.std
                .get(EdgelessCRUDIdentifier)
                .updateElement(model.id, props);
            }
            return;
          }

          for (const model of models) {
            model[e.type === 'start' ? 'stash' : 'pop'](field);
          }
        };

        return html`
          <edgeless-color-picker-button
            class="background"
            .label="${'Background'}"
            .pick=${onPick}
            .color=${background}
            .colorPanelClass="${'small'}"
            .theme=${theme}
            .palettes=${DefaultTheme.NoteBackgroundColorPalettes}
            .originalColor=${firstModel.props.background}
            .enableCustomColor=${enableCustomColor}
          >
          </edgeless-color-picker-button>
        `;
      },
    },
    {
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
          id: 'a.shadow-style',
          content(ctx) {
            const models = ctx.getSurfaceModelsByType(NoteBlockModel);
            if (!models.length) return null;

            const theme = ctx.theme.edgeless$.value;

            const firstModel = models[0];
            const { shadowType } = firstModel.props.edgeless.style;
            const background =
              getMostCommonResolvedValue(
                models.map(model => model.props),
                'background',
                background => resolveColor(background, theme)
              ) ?? resolveColor(DefaultTheme.noteBackgrounColor, theme);
            const onSelect = (e: CustomEvent<NoteShadow>) => {
              e.stopPropagation();

              const shadowType = e.detail;
              for (const model of models) {
                const edgeless = model.props.edgeless;
                ctx.std.get(EdgelessCRUDIdentifier).updateElement(model.id, {
                  edgeless: {
                    ...edgeless,
                    style: {
                      ...edgeless.style,
                      shadowType,
                    },
                  },
                });
              }
            };

            return html`${keyed(
              firstModel,
              html`<edgeless-note-shadow-dropdown-menu
                @select=${onSelect}
                .value="${shadowType}"
                .background="${background}"
                .theme="${theme}"
              ></edgeless-note-shadow-dropdown-menu>`
            )}`;
          },
        } satisfies ToolbarAction,
        {
          id: 'b.border-style',
          content(ctx) {
            const models = ctx.getSurfaceModelsByType(NoteBlockModel);
            if (!models.length) return null;

            const firstModel = models[0];
            const { borderSize, borderStyle } = firstModel.props.edgeless.style;
            const onSelect = (e: CustomEvent<LineDetailType>) => {
              e.stopPropagation();

              const { type, value } = e.detail;

              if (type === 'size') {
                const borderSize = value;
                for (const model of models) {
                  const edgeless = model.props.edgeless;
                  ctx.std.get(EdgelessCRUDIdentifier).updateElement(model.id, {
                    edgeless: {
                      ...edgeless,
                      style: {
                        ...edgeless.style,
                        borderSize,
                      },
                    },
                  });
                }
                return;
              }

              const borderStyle = value;
              for (const model of models) {
                const edgeless = model.props.edgeless;
                ctx.std.get(EdgelessCRUDIdentifier).updateElement(model.id, {
                  edgeless: {
                    ...edgeless,
                    style: {
                      ...edgeless.style,
                      borderStyle,
                    },
                  },
                });
              }
            };

            return html`${keyed(
              firstModel,
              html`
                <edgeless-note-border-dropdown-menu
                  @select=${onSelect}
                  .lineSize=${borderSize}
                  .lineStyle=${borderStyle}
                ></edgeless-note-border-dropdown-menu>
              `
            )}`;
          },
        } satisfies ToolbarAction,
        {
          id: 'c.corners',
          label: 'Corners',
          content(ctx) {
            const models = ctx.getSurfaceModelsByType(NoteBlockModel);
            if (!models.length) return null;

            const label = this.label;
            const firstModel = models[0];
            const borderRadius$ = computed(
              () => firstModel.props.edgeless$.value.style.borderRadius
            );
            const onSelect = (e: CustomEvent<number>) => {
              e.stopPropagation();

              const borderRadius = e.detail;
              for (const model of models) {
                const edgeless = model.props.edgeless;
                ctx.std.get(EdgelessCRUDIdentifier).updateElement(model.id, {
                  edgeless: {
                    ...edgeless,
                    style: {
                      ...edgeless.style,
                      borderRadius,
                    },
                  },
                });
              }
            };

            return html`${keyed(
              firstModel,
              html`<affine-size-dropdown-menu
                @select=${onSelect}
                .label="${label}"
                .icon=${CornerIcon()}
                .sizes=${CORNER_LIST}
                .size$=${borderRadius$}
              ></affine-size-dropdown-menu>`
            )}`;
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
          .size$=${scale$}
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

  const abortController = new AbortController();
  const clear = () => {
    ctx.history.off('stack-item-added', addHandler);
    ctx.history.off('stack-item-popped', popHandler);
    disposable.unsubscribe();
  };
  const closeNotify = () => {
    abortController.abort();
    clear();
  };

  const addHandler = ctx.history.on('stack-item-added', closeNotify);
  const popHandler = ctx.history.on('stack-item-popped', closeNotify);
  const disposable = ctx.std
    .get(EditorLifeCycleExtension)
    .slots.unmounted.subscribe(closeNotify);

  const undo = () => {
    ctx.store.undo();
    closeNotify();
  };

  const viewInToc = () => {
    const sidebar = ctx.std.getOptional(SidebarExtensionIdentifier);
    sidebar?.open('outline');
    closeNotify();
  };

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
  notification?.notify({
    title: data.title,
    message: `${data.message}. Find it in the TOC for quick navigation.`,
    accent: 'success',
    duration: 5 * 1000,
    footer: html`<div class=${styles.viewInPageNotifyFooter}>
      <button
        class=${styles.viewInPageNotifyFooterButton}
        @click=${undo}
        data-testid="undo-display-in-page"
      >
        Undo
      </button>
      <button
        class=${styles.viewInPageNotifyFooterButton}
        @click=${viewInToc}
        data-testid="view-in-toc"
      >
        View in Toc
      </button>
    </div>`,
    abort: abortController.signal,
    onClose: () => {
      clear();
    },
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
