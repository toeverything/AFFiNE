import { toast } from '@blocksuite/affine-components/toast';
import {
  copySelectedModelsCommand,
  draftSelectedModelsCommand,
} from '@blocksuite/affine-shared/commands';
import {
  ActionPlacement,
  blockCommentToolbarButton,
  type ToolbarModuleConfig,
} from '@blocksuite/affine-shared/services';
import { stopPropagation } from '@blocksuite/affine-shared/utils';
import { Bound } from '@blocksuite/global/gfx';
import { CaptionIcon, CopyIcon, DeleteIcon } from '@blocksuite/icons/lit';
import { html } from 'lit';

import { SurfaceRefSizeIcon } from '../icons';
import { SurfaceRefBlockComponent } from '../surface-ref-block';

const FRAME_ZOOM_BASELINE_SCALE = 0.5;

export const surfaceRefToolbarModuleConfig: ToolbarModuleConfig = {
  actions: [
    {
      id: 'a.surface-ref-title',
      when: ctx =>
        !!ctx.getCurrentBlockByType(SurfaceRefBlockComponent)?.referenceModel,
      content: ctx => {
        const surfaceRefBlock = ctx.getCurrentBlockByType(
          SurfaceRefBlockComponent
        );
        if (!surfaceRefBlock) return null;

        return html`<surface-ref-toolbar-title
          .referenceModel=${surfaceRefBlock.referenceModel}
        ></surface-ref-toolbar-title>`;
      },
    },
    {
      id: 'b.surface-ref-size',
      when: ctx => !!ctx.getCurrentBlockByType(SurfaceRefBlockComponent),
      content: ctx => {
        const surfaceRefBlock = ctx.getCurrentBlockByType(
          SurfaceRefBlockComponent
        );
        if (!surfaceRefBlock) return null;

        const model = surfaceRefBlock.model;
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
          model.props.frameAspectRatio ??
          getCurrentAspectRatio(surfaceRefBlock);

        const zoomPresets = [0.25, FRAME_ZOOM_BASELINE_SCALE, 1];
        const widthPresets = [0.5, 1, 1.25];

        const updateProps = (props: Record<string, unknown>) => {
          ctx.store.captureSync();
          ctx.store.updateBlock(model, props);
        };

        const updateZoomScale = (nextScale: number) => {
          updateProps({
            frameScaleMode: 'zoom',
            frameZoomScale: roundToTwoDecimals(nextScale),
            frameWidthMode: 'page',
            frameWidthScale: widthScale,
            pageSizeScale: roundToTwoDecimals(nextScale),
            pageWidthMode: 'page',
            pageWidthScale: 1,
          });
        };

        const updateWidthScale = (nextScale: number) => {
          if (nextScale === 1 && widthMode !== 'full') {
            updateProps({
              frameScaleMode: 'width',
              frameZoomScale: zoomScale,
              frameWidthMode: 'page',
              frameWidthScale: 1,
              pageSizeScale: 1,
              pageWidthMode: 'page',
              pageWidthScale: 1,
            });
            return;
          }

          updateProps({
            frameScaleMode: 'width',
            frameZoomScale: zoomScale,
            frameWidthMode: 'scale',
            frameWidthScale: roundToTwoDecimals(nextScale),
            pageSizeScale: 1,
            pageWidthMode: 'scale',
            pageWidthScale: roundToTwoDecimals(nextScale),
          });
        };

        const updateScaleMode = (nextMode: 'none' | 'zoom' | 'width') => {
          if (nextMode === 'none') {
            updateProps({
              frameScaleMode: 'none',
            });
            return;
          }
          if (nextMode === 'zoom') {
            updateZoomScale(zoomScale);
            return;
          }
          updateWidthScale(widthScale);
        };

        const updateWidthMode = (nextMode: 'page' | 'full' | 'scale') => {
          updateProps({
            frameScaleMode: 'width',
            frameZoomScale: zoomScale,
            frameWidthMode: nextMode,
            frameWidthScale: widthScale,
            pageSizeScale: 1,
            pageWidthMode: nextMode,
            pageWidthScale: widthScale,
          });
        };

        const updateAspect = (ratio: string, lock = aspectLock) => {
          updateProps({
            frameAspectRatio: ratio,
            frameAspectLock: lock,
          });
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
            ${SurfaceRefSizeIcon()}
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
                aria-label="Lock aspect"
                @click=${(event: Event) => {
                  event.stopPropagation();
                  updateProps({ frameAspectLock: !aspectLock });
                }}
                style=${`padding:0 6px;height:24px;${aspectLock ? 'background-color:var(--affine-hover-color);' : ''}`}
              >
                Lock
              </editor-menu-action>
              <editor-menu-action
                aria-label="16:9"
                ?data-selected=${aspectRatio === '16:9'}
                @click=${(event: Event) => {
                  event.stopPropagation();
                  updateAspect('16:9', true);
                }}
                style="padding:0 6px;height:24px;"
              >
                16:9
              </editor-menu-action>
              <editor-menu-action
                aria-label="4:3"
                ?data-selected=${aspectRatio === '4:3'}
                @click=${(event: Event) => {
                  event.stopPropagation();
                  updateAspect('4:3', true);
                }}
                style="padding:0 6px;height:24px;"
              >
                4:3
              </editor-menu-action>
              <input
                style="width:64px;min-width:64px;padding:4px 8px;border:1px solid var(--affine-border-color);border-radius:4px;font-size:12px;color:var(--affine-text-primary-color);background:transparent;height:24px;box-sizing:border-box;"
                type="text"
                inputmode="text"
                placeholder="x:y"
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
                    aria-label=${mode}
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
              style="font-size:12px;color:var(--affine-text-secondary-color);padding:2px 8px;font-weight:500;"
            >
              ${scaleMode === 'zoom'
                ? 'Zoom'
                : scaleMode === 'width'
                  ? 'Width'
                  : 'Value'}
            </div>
            <div
              class="custom"
              style="display:flex;align-items:center;gap:6px;padding:2px 8px 6px;min-height:34px;"
            >
              ${scaleMode === 'zoom'
                ? zoomPresets.map(
                    preset =>
                      html`<editor-menu-action
                        aria-label="${Math.round(preset * 100)}%"
                        ?data-selected=${Math.abs(zoomScale - preset) < 0.001}
                        @click=${(event: Event) => {
                          event.stopPropagation();
                          updateZoomScale(preset);
                        }}
                        style="padding:0 8px;height:24px;"
                        >${Math.round(preset * 100)}%</editor-menu-action
                      >`
                  )
                : scaleMode === 'width'
                  ? html`
                      ${widthPresets.map(
                        preset =>
                          html`<editor-menu-action
                            aria-label="${Math.round(preset * 100)}%"
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
                        aria-label="Full width"
                        ?data-selected=${widthMode === 'full'}
                        @click=${(event: Event) => {
                          event.stopPropagation();
                          updateWidthMode('full');
                        }}
                        style="padding:0 8px;height:24px;"
                        >Full</editor-menu-action
                      >
                    `
                  : html`<span
                      style="font-size:12px;color:var(--affine-text-secondary-color);padding:0 2px;"
                      >Current behavior</span
                    >`}
              <input
                style="width:64px;min-width:64px;padding:4px 8px;border:1px solid var(--affine-border-color);border-radius:4px;font-size:12px;color:var(--affine-text-primary-color);background:transparent;height:26px;box-sizing:border-box;"
                type="text"
                inputmode="decimal"
                pattern="^\\d+(\\.\\d{0,2})?$"
                placeholder=${scaleMode === 'zoom'
                  ? '50'
                  : scaleMode === 'width'
                    ? '100'
                    : '-'}
                .value=${scaleMode === 'zoom'
                  ? String(roundToTwoDecimals(zoomScale * 100))
                  : scaleMode === 'width' && widthMode === 'scale'
                    ? String(roundToTwoDecimals(widthScale * 100))
                    : ''}
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key !== 'Enter') return;
                  event.stopPropagation();
                  const next = parsePositiveNumber(
                    (event.target as HTMLInputElement).value
                  );
                  if (next === null) return;
                  if (scaleMode === 'zoom') updateZoomScale(next / 100);
                  if (scaleMode === 'width') updateWidthScale(next / 100);
                }}
                @change=${(event: Event) => {
                  event.stopPropagation();
                  const next = parsePositiveNumber(
                    (event.target as HTMLInputElement).value
                  );
                  if (next === null) return;
                  if (scaleMode === 'zoom') updateZoomScale(next / 100);
                  if (scaleMode === 'width') updateWidthScale(next / 100);
                }}
                @click=${stopPropagation}
                @pointerdown=${stopPropagation}
              />
            </div>
          </div>
        </editor-menu-button>`;
      },
    },
    {
      id: 'c.copy-surface-ref',
      label: 'Copy',
      icon: CopyIcon(),
      run: ctx => {
        const surfaceRefBlock = ctx.getCurrentBlockByType(
          SurfaceRefBlockComponent
        );
        if (!surfaceRefBlock) return;

        ctx.chain
          .pipe(draftSelectedModelsCommand, {
            selectedModels: [surfaceRefBlock.model],
          })
          .pipe(copySelectedModelsCommand)
          .run();

        toast(surfaceRefBlock.std.host, 'Copied to clipboard');
      },
    },
    {
      id: 'd.surface-ref-caption',
      icon: CaptionIcon(),
      run: ctx => {
        const surfaceRefBlock = ctx.getCurrentBlockByType(
          SurfaceRefBlockComponent
        );
        if (!surfaceRefBlock) return;

        surfaceRefBlock.captionElement.show();
      },
    },
    {
      id: 'e.comment',
      ...blockCommentToolbarButton,
    },
    {
      id: 'a.clipboard',
      placement: ActionPlacement.More,
      when: ctx => {
        const surfaceRefBlock = ctx.getCurrentBlock();
        if (!(surfaceRefBlock instanceof SurfaceRefBlockComponent))
          return false;

        return !!surfaceRefBlock.referenceModel;
      },
      actions: [
        // TODO(@L-Sun): add duplicate action after refactoring root-block/edgeless
      ],
    },
    {
      id: 'g.surface-ref-deletion',
      label: 'Delete',
      icon: DeleteIcon(),
      placement: ActionPlacement.More,
      variant: 'destructive',
      run: ctx => {
        const surfaceRefBlock = ctx.getCurrentBlockByType(
          SurfaceRefBlockComponent
        );
        if (!surfaceRefBlock) return;

        ctx.store.deleteBlock(surfaceRefBlock.model);
      },
    },
  ],
  placement: 'inner',
};

function normalizePositiveNumber(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function parsePositiveNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const numberValue = Number(trimmed);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
  return roundToTwoDecimals(numberValue);
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

function getCurrentAspectRatio(surfaceRefBlock: SurfaceRefBlockComponent) {
  const xywh = surfaceRefBlock.referenceModel?.xywh;
  if (!xywh) return '16:9';
  const { w, h } = Bound.deserialize(xywh);
  if (!w || !h) return '16:9';
  const ratio = w / h;
  if (!Number.isFinite(ratio) || ratio <= 0) return '16:9';
  return `${roundToTwoDecimals(ratio)}:1`;
}
