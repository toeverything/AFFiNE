import {
  exportFrameMetadata,
  exportFramePng,
  importFrameMetadata,
  importFramePng,
} from '@blocksuite/affine-block-frame';
import { toast } from '@blocksuite/affine-components/toast';
import { FrameBlockModel } from '@blocksuite/affine-model';
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
import {
  CaptionIcon,
  CopyIcon,
  DeleteIcon,
  DownloadIcon,
  UploadIcon,
} from '@blocksuite/icons/lit';
import { html } from 'lit';

import { SurfaceRefSizeIcon } from '../icons';
import { SurfaceRefBlockComponent } from '../surface-ref-block';

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
        const sizeScale = normalizePositiveNumber(model.props.pageSizeScale, 1);
        const widthScale = normalizePositiveNumber(
          model.props.pageWidthScale,
          1
        );
        const widthMode = model.props.pageWidthMode ?? 'page';

        const sizePresets = [1, 2];
        const widthPresets = [1, 2];
        const sizeCustomValue =
          sizeScale !== 1 && !sizePresets.includes(sizeScale)
            ? sizeScale
            : null;
        const widthCustomValue =
          widthMode === 'scale' && !widthPresets.includes(widthScale)
            ? widthScale
            : null;

        const updateProps = (props: Record<string, unknown>) => {
          ctx.store.captureSync();
          ctx.store.updateBlock(model, props);
        };

        const updateSizeScale = (nextScale: number) => {
          updateProps({
            pageSizeScale: roundToTwoDecimals(nextScale),
            pageWidthMode: widthMode,
            pageWidthScale: widthScale,
          });
        };

        const updateWidthScale = (nextScale: number) => {
          if (nextScale === 1) {
            updateProps({
              pageSizeScale: sizeScale,
              pageWidthMode: 'page',
              pageWidthScale: 1,
            });
            return;
          }

          updateProps({
            pageSizeScale: sizeScale,
            pageWidthMode: 'scale',
            pageWidthScale: roundToTwoDecimals(nextScale),
          });
        };

        const updateWidthMode = (nextMode: 'page' | 'full' | 'scale') => {
          updateProps({
            pageSizeScale: sizeScale,
            pageWidthMode: nextMode,
            pageWidthScale: widthScale,
          });
        };

        const commitCustomSize = (value: string) => {
          const next = parsePositiveNumber(value);
          if (next === null) return;
          updateSizeScale(next);
        };

        const commitCustomWidth = (value: string) => {
          const next = parsePositiveNumber(value);
          if (next === null) return;
          updateWidthScale(next);
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
          <div data-orientation="vertical" style="min-width: 152px;">
            <div
              class="custom"
              style="font-size:12px;color:var(--affine-text-secondary-color);padding:2px 8px;font-weight:500;"
            >
              Height
            </div>
            ${sizePresets.map(
              preset => html`
                <editor-menu-action
                  aria-label="${preset}x"
                  ?data-selected=${sizeScale === preset}
                  @click=${() => updateSizeScale(preset)}
                >
                  ${preset}x
                </editor-menu-action>
              `
            )}
            <div
              class="custom"
              style="display:flex;align-items:center;gap:8px;padding:2px 8px 6px;"
            >
              <span
                style="font-size:13px;color:var(--affine-text-primary-color);"
              >
                Custom
              </span>
              <input
                style="width:64px;min-width:64px;padding:4px 8px;border:1px solid var(--affine-border-color);border-radius:4px;font-size:12px;color:var(--affine-text-primary-color);background:transparent;height:26px;box-sizing:border-box;"
                type="text"
                inputmode="decimal"
                pattern="^\\d+(\\.\\d{0,2})?$"
                placeholder="3"
                .value=${sizeCustomValue ? String(sizeCustomValue) : ''}
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key !== 'Enter') return;
                  event.stopPropagation();
                  commitCustomSize((event.target as HTMLInputElement).value);
                }}
                @change=${(event: Event) =>
                  commitCustomSize((event.target as HTMLInputElement).value)}
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
              Width
            </div>
            ${widthPresets.map(
              preset => html`
                <editor-menu-action
                  aria-label="${preset}x"
                  ?data-selected=${preset === 1
                    ? widthMode === 'page' ||
                      (widthMode === 'scale' && widthScale === 1)
                    : widthMode === 'scale' && widthScale === preset}
                  @click=${() => updateWidthScale(preset)}
                >
                  ${preset}x
                </editor-menu-action>
              `
            )}
            <editor-menu-action
              aria-label="Full"
              ?data-selected=${widthMode === 'full'}
              @click=${() => updateWidthMode('full')}
            >
              Full
            </editor-menu-action>
            <div
              class="custom"
              style="display:flex;align-items:center;gap:8px;padding:2px 8px 6px;"
            >
              <span
                style="font-size:13px;color:var(--affine-text-primary-color);"
              >
                Custom
              </span>
              <input
                style="width:64px;min-width:64px;padding:4px 8px;border:1px solid var(--affine-border-color);border-radius:4px;font-size:12px;color:var(--affine-text-primary-color);background:transparent;height:26px;box-sizing:border-box;"
                type="text"
                inputmode="decimal"
                pattern="^\\d+(\\.\\d{0,2})?$"
                placeholder="1"
                .value=${widthCustomValue ? String(widthCustomValue) : ''}
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key !== 'Enter') return;
                  event.stopPropagation();
                  commitCustomWidth((event.target as HTMLInputElement).value);
                }}
                @change=${(event: Event) =>
                  commitCustomWidth((event.target as HTMLInputElement).value)}
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
        {
          id: 'a.export-frame-metadata',
          label: 'Export Frame Metadata',
          icon: DownloadIcon(),
          when: ctx => {
            const surfaceRefBlock = ctx.getCurrentBlockByType(
              SurfaceRefBlockComponent
            );
            return surfaceRefBlock?.referenceModel instanceof FrameBlockModel;
          },
          async run(ctx) {
            const surfaceRefBlock = ctx.getCurrentBlockByType(
              SurfaceRefBlockComponent
            );
            if (!(surfaceRefBlock?.referenceModel instanceof FrameBlockModel))
              return;
            await exportFrameMetadata(ctx, surfaceRefBlock.referenceModel);
          },
        },
        {
          id: 'a.export-frame-png',
          label: 'Export Frame PNG',
          icon: DownloadIcon(),
          when: ctx => {
            const surfaceRefBlock = ctx.getCurrentBlockByType(
              SurfaceRefBlockComponent
            );
            return surfaceRefBlock?.referenceModel instanceof FrameBlockModel;
          },
          async run(ctx) {
            const surfaceRefBlock = ctx.getCurrentBlockByType(
              SurfaceRefBlockComponent
            );
            if (!(surfaceRefBlock?.referenceModel instanceof FrameBlockModel))
              return;
            const renderStd = surfaceRefBlock.previewEditor?.std;
            const caption = surfaceRefBlock.model.props.caption;
            await exportFramePng(
              ctx,
              surfaceRefBlock.referenceModel,
              renderStd ?? undefined,
              { caption }
            );
          },
        },
        {
          id: 'b.import-frame-metadata',
          label: 'Import Frame Metadata',
          icon: UploadIcon(),
          when: ctx => {
            const surfaceRefBlock = ctx.getCurrentBlockByType(
              SurfaceRefBlockComponent
            );
            return surfaceRefBlock?.referenceModel instanceof FrameBlockModel;
          },
          async run(ctx) {
            const surfaceRefBlock = ctx.getCurrentBlockByType(
              SurfaceRefBlockComponent
            );
            if (!(surfaceRefBlock?.referenceModel instanceof FrameBlockModel))
              return;
            await importFrameMetadata(ctx, surfaceRefBlock.referenceModel);
          },
        },
        {
          id: 'b.import-frame-png',
          label: 'Import Frame PNG',
          icon: UploadIcon(),
          when: ctx => {
            const surfaceRefBlock = ctx.getCurrentBlockByType(
              SurfaceRefBlockComponent
            );
            return surfaceRefBlock?.referenceModel instanceof FrameBlockModel;
          },
          async run(ctx) {
            const surfaceRefBlock = ctx.getCurrentBlockByType(
              SurfaceRefBlockComponent
            );
            if (!(surfaceRefBlock?.referenceModel instanceof FrameBlockModel))
              return;
            await importFramePng(ctx, surfaceRefBlock.referenceModel);
          },
        },
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
