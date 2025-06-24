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
import { BlockFlavourIdentifier } from '@blocksuite/std';
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
