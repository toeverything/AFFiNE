import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import {
  packColor,
  type PickColorEvent,
} from '@blocksuite/affine-components/color-picker';
import {
  BrushElementModel,
  DefaultTheme,
  LineWidth,
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
import { BlockFlavourIdentifier } from '@blocksuite/block-std';
import { html } from 'lit';

export const brushToolbarConfig = {
  actions: [
    {
      id: 'a.line-width',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(BrushElementModel);
        if (!models.length) return null;

        const lineWidth =
          getMostCommonValue(models, 'lineWidth') ?? LineWidth.Four;
        const onPick = (e: CustomEvent<LineWidth>) => {
          e.stopPropagation();

          const lineWidth = e.detail;

          for (const model of models) {
            ctx.std
              .get(EdgelessCRUDIdentifier)
              .updateElement(model.id, { lineWidth });
          }
        };

        return html`
          <edgeless-line-width-panel
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
        const models = ctx.getSurfaceModelsByType(BrushElementModel);
        if (!models.length) return null;

        const enableCustomColor = ctx.features.getFlag('enable_color_picker');
        const theme = ctx.theme.edgeless$.value;

        const field = 'color';
        const firstModel = models[0];
        const originalColor = firstModel[field];
        const color =
          getMostCommonResolvedValue(models, field, color =>
            resolveColor(color, theme)
          ) ?? resolveColor(DefaultTheme.black, theme);
        const onPick = (e: PickColorEvent) => {
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
            class="color"
            .label="${'Color'}"
            .pick=${onPick}
            .color=${color}
            .theme=${theme}
            .originalColor=${originalColor}
            .enableCustomColor=${enableCustomColor}
          >
          </edgeless-color-picker-button>
        `;
      },
    },
  ],

  when: ctx => ctx.getSurfaceModelsByType(BrushElementModel).length > 0,
} as const satisfies ToolbarModuleConfig;

export const brushToolbarExtension = ToolbarModuleExtension({
  id: BlockFlavourIdentifier('affine:surface:brush'),
  config: brushToolbarConfig,
});
