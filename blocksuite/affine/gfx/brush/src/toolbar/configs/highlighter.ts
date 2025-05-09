import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import {
  adjustColorAlpha,
  keepColor,
  packColor,
  type PickColorEvent,
} from '@blocksuite/affine-components/color-picker';
import {
  DEFAULT_HIGHLIGHTER_LINE_WIDTH,
  DefaultTheme,
  HIGHLIGHTER_LINE_WIDTHS,
  HighlighterElementModel,
  resolveColor,
} from '@blocksuite/affine-model';
import {
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import {
  getMostCommonResolvedValue,
  getMostCommonValue,
} from '@blocksuite/affine-shared/utils';
import { BlockFlavourIdentifier } from '@blocksuite/std';
import { html } from 'lit';

const trackBaseProps = {
  category: 'highlighter',
};

export const highlighterToolbarConfig = {
  actions: [
    {
      id: 'a.line-width',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(HighlighterElementModel);
        if (!models.length) return null;

        const lineWidth =
          getMostCommonValue(models, 'lineWidth') ??
          DEFAULT_HIGHLIGHTER_LINE_WIDTH;
        const onPick = (e: CustomEvent<number>) => {
          e.stopPropagation();

          const lineWidth = e.detail;

          for (const model of models) {
            ctx.std
              .get(EdgelessCRUDIdentifier)
              .updateElement(model.id, { lineWidth });
          }

          ctx.track('CanvasElementUpdated', {
            ...trackBaseProps,
            control: 'line width',
          });
        };

        return html`
          <edgeless-line-width-panel
            .config=${{
              width: 140,
              itemSize: 16,
              itemIconSize: 8,
              dragHandleSize: 14,
              count: HIGHLIGHTER_LINE_WIDTHS.length,
            }}
            .lineWidths=${HIGHLIGHTER_LINE_WIDTHS}
            .selectedSize=${lineWidth}
            @select=${onPick}
          >
          </edgeless-line-width-panel>
        `;
      },
    },
    {
      id: 'b.color-picker',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(HighlighterElementModel);
        if (!models.length) return null;

        const theme = ctx.theme.edgeless$.value;

        const field = 'color';
        const firstModel = models[0];
        const originalColor = firstModel[field];
        const color = keepColor(
          getMostCommonResolvedValue(models, field, color =>
            resolveColor(color, theme)
          ) ?? resolveColor(DefaultTheme.black, theme)
        );
        const onPick = (e: PickColorEvent) => {
          if (e.type === 'pick') {
            const color = adjustColorAlpha(e.detail.value, 0.3);
            for (const model of models) {
              const props = packColor(field, color);
              ctx.std
                .get(EdgelessCRUDIdentifier)
                .updateElement(model.id, props);
            }
            return;
          }

          const isStartEvent = e.type === 'start';
          for (const model of models) {
            model[isStartEvent ? 'stash' : 'pop'](field);
          }

          if (!isStartEvent) return;
          ctx.track('CanvasElementUpdated', {
            ...trackBaseProps,
            control: 'color picker',
          });
        };

        return html`
          <edgeless-color-picker-button
            .colorPanelClass="${'one-way small'}"
            .label="${'Color'}"
            .pick=${onPick}
            .color=${color}
            .theme=${theme}
            .originalColor=${originalColor}
            .palettes=${DefaultTheme.StrokeColorShortPalettes}
            .shouldKeepColor=${true}
            .enableCustomColor=${false}
          >
          </edgeless-color-picker-button>
        `;
      },
    },
  ],

  when: ctx => ctx.getSurfaceModelsByType(HighlighterElementModel).length > 0,
} as const satisfies ToolbarModuleConfig;

export const highlighterToolbarExtension = ToolbarModuleExtension({
  id: BlockFlavourIdentifier('affine:surface:highlighter'),
  config: highlighterToolbarConfig,
});
