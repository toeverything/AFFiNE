import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import {
  packColor,
  type PickColorEvent,
} from '@blocksuite/affine-components/color-picker';
import { toast } from '@blocksuite/affine-components/toast';
import {
  DEFAULT_NOTE_HEIGHT,
  DefaultTheme,
  FrameBlockModel,
  FrameBlockSchema,
  NoteBlockModel,
  NoteBlockSchema,
  NoteDisplayMode,
  resolveColor,
  SurfaceRefBlockSchema,
} from '@blocksuite/affine-model';
import {
  NotificationProvider,
  type ToolbarContext,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import {
  getMostCommonResolvedValue,
  matchModels,
  stopPropagation,
} from '@blocksuite/affine-shared/utils';
import { mountFrameTitleEditor } from '@blocksuite/affine-widget-frame-title';
import { Bound } from '@blocksuite/global/gfx';
import {
  EditIcon,
  InsertIntoPageIcon,
  UngroupIcon,
} from '@blocksuite/icons/lit';
import { type BlockComponent, BlockFlavourIdentifier } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import type { ExtensionType } from '@blocksuite/store';
import { html } from 'lit';

import { EdgelessFrameManagerIdentifier } from './frame-manager';

const FRAME_ZOOM_BASELINE_SCALE = 0.5;

function getRootBlock(ctx: ToolbarContext): BlockComponent | null {
  const rootModel = ctx.store.root;
  if (!rootModel) return null;

  return ctx.view.getBlock(rootModel.id);
}

const builtinSurfaceToolbarConfig = {
  actions: [
    {
      id: 'a.insert-into-page',
      label: 'Insert into Page',
      tooltip: 'Insert into Page',
      icon: InsertIntoPageIcon(),
      when: ctx => ctx.getSurfaceModelsByType(FrameBlockModel).length === 1,
      run(ctx) {
        const model = ctx.getCurrentModelByType(FrameBlockModel);
        if (!model) return;

        const rootModel = ctx.store.root;
        if (!rootModel) return;

        const { id: frameId, xywh, props } = model;
        let lastNoteId = rootModel.children.findLast(
          note =>
            matchModels(note, [NoteBlockModel]) &&
            note.props.displayMode !== NoteDisplayMode.EdgelessOnly
        )?.id;

        if (!lastNoteId) {
          const bounds = Bound.deserialize(xywh);
          bounds.y += bounds.h;
          bounds.h = DEFAULT_NOTE_HEIGHT;

          lastNoteId = ctx.store.addBlock(
            NoteBlockSchema.model.flavour,
            { xywh: bounds.serialize() },
            rootModel.id
          );
        }

        ctx.store.captureSync();
        ctx.store.addBlock(
          SurfaceRefBlockSchema.model.flavour,
          {
            reference: frameId,
            refFlavour: FrameBlockSchema.model.flavour,
            frameScaleMode: props.frameScaleMode,
            frameZoomScale: props.frameZoomScale,
            frameWidthMode: props.frameWidthMode,
            frameWidthScale: props.frameWidthScale,
            frameAspectLock: props.frameAspectLock,
            frameAspectRatio: props.frameAspectRatio,
            frameRenderOptions: props.frameRenderOptions,
            pageSizeScale: props.frameZoomScale,
            pageWidthMode: props.frameWidthMode,
            pageWidthScale: props.frameWidthScale,
          },
          lastNoteId
        );

        const notification = ctx.std.getOptional(NotificationProvider);
        if (notification) {
          notification.notifyWithUndoAction({
            title: 'Frame inserted into Page.',
            message: 'Frame has been inserted into doc',
            accent: 'success',
          });
        } else {
          toast(ctx.host, 'Frame has been inserted into doc');
        }
      },
    },
    {
      id: 'b.frame-size',
      tooltip: 'Frame size',
      icon: FrameSizeIcon(),
      when: ctx => ctx.getSurfaceModelsByType(FrameBlockModel).length === 1,
      content(ctx) {
        const model = ctx.getCurrentModelByType(FrameBlockModel);
        if (!model) return null;

        const scaleMode = model.props.frameScaleMode ?? 'none';
        const zoomScale = normalizePositiveNumber(
          model.props.frameZoomScale,
          FRAME_ZOOM_BASELINE_SCALE
        );
        const widthScale = normalizePositiveNumber(
          model.props.frameWidthScale,
          1
        );
        const widthMode = model.props.frameWidthMode ?? 'page';
        const aspectLock = Boolean(model.props.frameAspectLock);
        const aspectRatio =
          model.props.frameAspectRatio ?? getFrameAspectRatio(model);

        const updateProps = (patch: Record<string, unknown>) => {
          ctx.store.captureSync();
          ctx.store.updateBlock(model, patch);
        };

        const updateZoomScale = (nextScale: number) => {
          const currentScale = normalizePositiveNumber(
            model.props.frameZoomScale,
            FRAME_ZOOM_BASELINE_SCALE
          );
          applyFrameScale(model, ctx, nextScale / currentScale);
          updateProps({
            frameScaleMode: 'zoom',
            frameZoomScale: roundToTwoDecimals(nextScale),
            frameWidthMode: 'page',
          });
        };

        const updateWidthScale = (nextScale: number) => {
          updateProps({
            frameScaleMode: 'width',
            frameWidthMode: nextScale === 1 ? 'page' : 'scale',
            frameWidthScale: roundToTwoDecimals(nextScale),
          });
        };

        const updateScaleMode = (nextMode: 'none' | 'zoom' | 'width') => {
          if (nextMode === 'none') {
            updateProps({ frameScaleMode: 'none' });
            return;
          }
          if (nextMode === 'zoom') {
            updateZoomScale(zoomScale);
            return;
          }
          updateWidthScale(widthScale);
        };

        const updateAspect = (ratio: string, lock = aspectLock) => {
          applyFrameAspectRatio(model, ctx, ratio);
          updateProps({ frameAspectRatio: ratio, frameAspectLock: lock });
        };

        return html`<editor-menu-button
          aria-label="Frame size"
          .contentPadding=${'8px'}
          .button=${html`<editor-icon-button
            aria-label="Frame size"
            .tooltip=${'Frame size'}
            .iconContainerPadding=${4}
            .iconSize=${'16px'}
          >
            ${FrameSizeIcon()}
          </editor-icon-button>`}
        >
          <div
            data-orientation="vertical"
            style="min-width: 228px;"
            @pointerdown=${stopPropagation}
            @click=${stopPropagation}
          >
            <div
              class="custom"
              style="font-size:12px;color:var(--affine-text-secondary-color);padding:2px 8px;font-weight:500;"
            >
              Aspect ratio
            </div>
            <div
              class="custom"
              style="display:flex;align-items:center;gap:6px;padding:2px 8px 6px;"
            >
              <editor-menu-action
                @click=${(event: Event) => {
                  event.stopPropagation();
                  updateProps({ frameAspectLock: !aspectLock });
                }}
                style=${`padding:0 6px;height:24px;${aspectLock ? 'background-color:var(--affine-hover-color);' : ''}`}
                >Lock</editor-menu-action
              >
              <editor-menu-action
                ?data-selected=${aspectRatio === '16:9'}
                @click=${(event: Event) => {
                  event.stopPropagation();
                  updateAspect('16:9', true);
                }}
                style="padding:0 6px;height:24px;"
                >16:9</editor-menu-action
              >
              <editor-menu-action
                ?data-selected=${aspectRatio === '4:3'}
                @click=${(event: Event) => {
                  event.stopPropagation();
                  updateAspect('4:3', true);
                }}
                style="padding:0 6px;height:24px;"
                >4:3</editor-menu-action
              >
              <input
                style="width:64px;min-width:64px;padding:4px 8px;border:1px solid var(--affine-border-color);border-radius:4px;font-size:12px;background:transparent;height:24px;box-sizing:border-box;"
                .value=${aspectRatio}
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key !== 'Enter') return;
                  event.stopPropagation();
                  const next = parseAspectRatio(
                    (event.target as HTMLInputElement).value
                  );
                  if (next) updateAspect(next);
                }}
                @change=${(event: Event) => {
                  event.stopPropagation();
                  const next = parseAspectRatio(
                    (event.target as HTMLInputElement).value
                  );
                  if (next) updateAspect(next);
                }}
                @click=${stopPropagation}
                @pointerdown=${stopPropagation}
              />
            </div>
            <div
              class="custom"
              style="height:1px;margin:6px 4px;background:var(--affine-divider-color);"
            ></div>
            <div
              class="custom"
              style="font-size:12px;color:var(--affine-text-secondary-color);padding:2px 8px;font-weight:500;"
            >
              Mode
            </div>
            <div
              class="custom"
              style="display:flex;gap:6px;padding:2px 8px 6px;"
            >
              ${(['none', 'zoom', 'width'] as const).map(
                mode =>
                  html`<editor-menu-action
                    ?data-selected=${scaleMode === mode}
                    @click=${(event: Event) => {
                      event.stopPropagation();
                      updateScaleMode(mode);
                    }}
                    style="padding:0 10px;height:24px;text-transform:capitalize;"
                    >${mode}</editor-menu-action
                  >`
              )}
            </div>
            <div
              class="custom"
              style="display:flex;align-items:center;gap:6px;padding:2px 8px 6px;min-height:34px;"
            >
              ${scaleMode === 'zoom'
                ? html`${[0.25, FRAME_ZOOM_BASELINE_SCALE, 1].map(
                    preset =>
                      html`<editor-menu-action
                        ?data-selected=${Math.abs(zoomScale - preset) < 0.001}
                        @click=${(event: Event) => {
                          event.stopPropagation();
                          updateZoomScale(preset);
                        }}
                        style="padding:0 8px;height:24px;"
                        >${Math.round(preset * 100)}%</editor-menu-action
                      >`
                  )}`
                : scaleMode === 'width'
                  ? html`${[0.5, 1, 1.25].map(
                        preset =>
                          html`<editor-menu-action
                            ?data-selected=${widthMode === 'scale' &&
                            Math.abs(widthScale - preset) < 0.001}
                            @click=${(event: Event) => {
                              event.stopPropagation();
                              updateWidthScale(preset);
                            }}
                            style="padding:0 8px;height:24px;"
                            >${Math.round(preset * 100)}%</editor-menu-action
                          >`
                      )}
                      <editor-menu-action
                        ?data-selected=${widthMode === 'full'}
                        @click=${(event: Event) => {
                          event.stopPropagation();
                          updateProps({
                            frameScaleMode: 'width',
                            frameWidthMode: 'full',
                          });
                        }}
                        style="padding:0 8px;height:24px;"
                        >Full</editor-menu-action
                      >`
                  : html`<span
                      style="font-size:12px;color:var(--affine-text-secondary-color);"
                      >Current behavior</span
                    >`}
            </div>
          </div>
        </editor-menu-button>`;
      },
    },
    {
      id: 'c.rename',
      tooltip: 'Rename',
      icon: EditIcon(),
      when: ctx => ctx.getSurfaceModelsByType(FrameBlockModel).length === 1,
      run(ctx) {
        const model = ctx.getCurrentModelByType(FrameBlockModel);
        if (!model) return;

        const rootBlock = getRootBlock(ctx);
        if (!rootBlock) return;

        mountFrameTitleEditor(model, rootBlock);
      },
    },
    {
      id: 'd.ungroup',
      tooltip: 'Ungroup',
      icon: UngroupIcon(),
      run(ctx) {
        const models = ctx.getSurfaceModelsByType(FrameBlockModel);
        if (!models.length) return;

        const crud = ctx.std.get(EdgelessCRUDIdentifier);
        const gfx = ctx.std.get(GfxControllerIdentifier);

        ctx.store.captureSync();

        const frameManager = ctx.std.get(EdgelessFrameManagerIdentifier);

        for (const model of models) {
          frameManager.removeAllChildrenFromFrame(model);
        }

        for (const model of models) {
          crud.removeElement(model.id);
        }

        gfx.selection.clear();
      },
    },
    {
      id: 'c.color-picker',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(FrameBlockModel);
        if (!models.length) return null;

        const enableCustomColor = ctx.features.getFlag('enable_color_picker');
        const theme = ctx.theme.edgeless$.value;

        const field = 'background';
        const firstModel = models[0];
        const background =
          getMostCommonResolvedValue(
            models.map(model => model.props),
            field,
            background => resolveColor(background, theme)
          ) ?? DefaultTheme.transparent;
        const onPick = (e: PickColorEvent) => {
          switch (e.type) {
            case 'pick':
              {
                const color = e.detail.value;
                const props = packColor(field, color);
                const crud = ctx.std.get(EdgelessCRUDIdentifier);
                models.forEach(model => {
                  crud.updateElement(model.id, props);
                });
              }
              break;
            case 'start':
              ctx.store.captureSync();
              models.forEach(model => {
                model.stash(field);
              });
              break;
            case 'end':
              ctx.store.transact(() => {
                models.forEach(model => {
                  model.pop(field);
                });
              });
              break;
          }
        };

        return html`
          <edgeless-color-picker-button
            class="background"
            .label="${'Background'}"
            .pick=${onPick}
            .color=${background}
            .theme=${theme}
            .originalColor=${firstModel.props.background}
            .enableCustomColor=${enableCustomColor}
          >
          </edgeless-color-picker-button>
        `;
      },
    },
  ],

  when: ctx => ctx.getSurfaceModelsByType(FrameBlockModel).length > 0,
} as const satisfies ToolbarModuleConfig;

const createFrameToolbarConfig = (flavour: string): ExtensionType => {
  const name = flavour.split(':').pop();

  return ToolbarModuleExtension({
    id: BlockFlavourIdentifier(`affine:surface:${name}`),
    config: builtinSurfaceToolbarConfig,
  });
};

export const frameToolbarExtension = createFrameToolbarConfig(
  FrameBlockSchema.model.flavour
);

function normalizePositiveNumber(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function roundToTwoDecimals(value: number) {
  return Math.round(value * 100) / 100;
}

function parseAspectRatio(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x <= 0 || y <= 0) {
    return null;
  }
  return `${roundToTwoDecimals(x)}:${roundToTwoDecimals(y)}`;
}

function getFrameAspectRatio(model: FrameBlockModel) {
  const { w, h } = Bound.deserialize(model.xywh);
  if (!w || !h) return '16:9';
  const ratio = w / h;
  if (!Number.isFinite(ratio) || ratio <= 0) return '16:9';
  return `${roundToTwoDecimals(ratio)}:1`;
}

function applyFrameScale(
  model: FrameBlockModel,
  ctx: ToolbarContext,
  scaleFactor: number
) {
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0 || scaleFactor === 1) {
    return;
  }
  const bounds = Bound.deserialize(model.xywh);
  bounds.w *= scaleFactor;
  bounds.h *= scaleFactor;
  ctx.store.updateBlock(model, { xywh: bounds.serialize() });
}

function applyFrameAspectRatio(
  model: FrameBlockModel,
  ctx: ToolbarContext,
  ratio: string
) {
  const parsed = parseAspectRatio(ratio);
  if (!parsed) return;
  const [x, y] = parsed.split(':').map(Number);
  if (!x || !y) return;

  const targetRatio = x / y;
  if (!Number.isFinite(targetRatio) || targetRatio <= 0) return;

  const bounds = Bound.deserialize(model.xywh);
  bounds.h = bounds.w / targetRatio;
  ctx.store.updateBlock(model, { xywh: bounds.serialize() });
}

function FrameSizeIcon() {
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
