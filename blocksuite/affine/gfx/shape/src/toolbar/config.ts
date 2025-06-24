import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import {
  packColor,
  type PickColorEvent,
} from '@blocksuite/affine-components/color-picker';
import type { LineDetailType } from '@blocksuite/affine-components/edgeless-line-styles-panel';
import { createTextActions } from '@blocksuite/affine-gfx-text';
import {
  type Color,
  DefaultTheme,
  FontFamily,
  getShapeName,
  getShapeRadius,
  getShapeType,
  isTransparent,
  LineWidth,
  MindmapElementModel,
  type Palette,
  resolveColor,
  ShapeElementModel,
  type ShapeName,
  ShapeStyle,
  ShapeType,
  StrokeStyle,
} from '@blocksuite/affine-model';
import {
  type ToolbarGenericAction,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { getMostCommonValue } from '@blocksuite/affine-shared/utils';
import {
  getRootBlock,
  LINE_STYLE_LIST,
  renderMenu,
} from '@blocksuite/affine-widget-edgeless-toolbar';
import { Bound } from '@blocksuite/global/gfx';
import { AddTextIcon, ShapeIcon } from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/std';
import { html } from 'lit';
import isEqual from 'lodash-es/isEqual';

import { normalizeShapeBound } from '../element-renderer';
import type { ShapeToolOption } from '../shape-tool';
import { mountShapeTextEditor } from '../text/edgeless-shape-text-editor';
import { ShapeComponentConfig } from './shape-menu-config';

export const shapeToolbarConfig = {
  actions: [
    {
      id: 'c.switch-type',
      when(ctx) {
        const models = ctx.getSurfaceModelsByType(ShapeElementModel);
        return models.length > 0 && models.every(model => !hasGrouped(model));
      },
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(ShapeElementModel);
        if (!models.length) return null;

        const shapeStyle = ctx.features.getFlag(
          'enable_edgeless_scribbled_style'
        )
          ? (getMostCommonValue(models, 'shapeStyle') ?? ShapeStyle.General)
          : ShapeStyle.General;

        const shapeName =
          getMostCommonValue<ShapeToolOption, 'shapeName'>(
            models.map(model => ({
              shapeName: getShapeName(model.shapeType, model.radius),
            })),
            'shapeName'
          ) ?? ShapeType.Rect;

        const onPick = (shapeName: ShapeName) => {
          const shapeType = getShapeType(shapeName);
          const radius = getShapeRadius(shapeName);

          ctx.std.store.captureSync();

          for (const model of models) {
            ctx.std
              .get(EdgelessCRUDIdentifier)
              .updateElement(model.id, { shapeType, radius });
          }
        };

        return renderMenu({
          icon: ShapeIcon(),
          label: 'Switch shape type',
          items: ShapeComponentConfig.map(item => ({
            key: item.tooltip,
            value: item.name,
            icon:
              shapeStyle === ShapeStyle.General
                ? item.generalIcon
                : item.scribbledIcon,
            disabled: item.disabled,
          })),
          currentValue: shapeName,
          onPick,
        });
      },
    },
    {
      id: 'd.style',
      when: ctx => ctx.features.getFlag('enable_edgeless_scribbled_style'),
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(ShapeElementModel);
        if (!models.length) return null;

        const field = 'shapeStyle';
        const shapeStyle =
          getMostCommonValue(models, field) ?? ShapeStyle.General;
        const onPick = (value: boolean) => {
          const shapeStyle = value ? ShapeStyle.Scribbled : ShapeStyle.General;
          const fontFamily = value ? FontFamily.Kalam : FontFamily.Inter;

          for (const model of models) {
            ctx.std
              .get(EdgelessCRUDIdentifier)
              .updateElement(model.id, { shapeStyle, fontFamily });
          }
        };

        return renderMenu({
          label: 'Style',
          items: LINE_STYLE_LIST,
          currentValue: shapeStyle === ShapeStyle.Scribbled,
          onPick,
        });
      },
    },
    {
      id: 'e.color',
      when(ctx) {
        const models = ctx.getSurfaceModelsByType(ShapeElementModel);
        return models.length > 0 && models.every(model => !hasGrouped(model));
      },
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(ShapeElementModel);
        if (!models.length) return null;

        const enableCustomColor = ctx.features.getFlag('enable_color_picker');
        const theme = ctx.theme.edgeless$.value;

        const firstModel = models[0];
        const originalFillColor = firstModel.fillColor;
        const originalStrokeColor = firstModel.strokeColor;

        const mapped = models.map(
          ({ filled, fillColor, strokeColor, strokeWidth, strokeStyle }) => ({
            fillColor: filled
              ? resolveColor(fillColor, theme)
              : DefaultTheme.transparent,
            strokeColor: resolveColor(strokeColor, theme),
            strokeWidth,
            strokeStyle,
          })
        );
        const fillColor =
          getMostCommonValue(mapped, 'fillColor') ??
          resolveColor(DefaultTheme.shapeFillColor, theme);
        const strokeColor =
          getMostCommonValue(mapped, 'strokeColor') ??
          resolveColor(DefaultTheme.shapeStrokeColor, theme);
        const strokeWidth =
          getMostCommonValue(mapped, 'strokeWidth') ?? LineWidth.Four;
        const strokeStyle =
          getMostCommonValue(mapped, 'strokeStyle') ?? StrokeStyle.Solid;

        const pickColorWrapper =
          (field: string, pickCallback: (palette: Palette) => void) =>
          (e: CustomEvent<PickColorEvent>) => {
            e.stopPropagation();

            switch (e.detail.type) {
              case 'pick':
                pickCallback(e.detail.detail);
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
            }
          };

        const onPickFillColor = pickColorWrapper('fillColor', palette => {
          const value = palette.value;
          const filled = isTransparent(value);
          const props = packColor('fillColor', value);
          const crud = ctx.std.get(EdgelessCRUDIdentifier);
          models.forEach(model => {
            if (filled && !model.filled) {
              const color = getTextColor(value, filled);
              Object.assign(props, { filled, color });
            }
            crud.updateElement(model.id, props);
          });
        });

        const onPickStrokeColor = pickColorWrapper('strokeColor', palette => {
          const value = palette.value;
          const props = packColor('strokeColor', value);
          const crud = ctx.std.get(EdgelessCRUDIdentifier);
          models.forEach(model => {
            crud.updateElement(model.id, props);
          });
        });

        const onPickStrokeStyle = (e: CustomEvent<LineDetailType>) => {
          e.stopPropagation();

          const { type, value } = e.detail;

          if (type === 'size') {
            const strokeWidth = value;
            for (const model of models) {
              ctx.std
                .get(EdgelessCRUDIdentifier)
                .updateElement(model.id, { strokeWidth });
            }
            return;
          }

          const strokeStyle = value;
          for (const model of models) {
            ctx.std
              .get(EdgelessCRUDIdentifier)
              .updateElement(model.id, { strokeStyle });
          }
        };

        return html`
          <edgeless-shape-color-picker
            @pickFillColor=${onPickFillColor}
            @pickStrokeColor=${onPickStrokeColor}
            @pickStrokeStyle=${onPickStrokeStyle}
            .payload=${{
              fillColor,
              strokeColor,
              strokeWidth,
              strokeStyle,
              originalFillColor,
              originalStrokeColor,
              theme,
              enableCustomColor,
            }}
          >
          </edgeless-shape-color-picker>
        `;
      },
    },
    {
      id: 'f.text',
      tooltip: 'Add text',
      icon: AddTextIcon(),
      when(ctx) {
        const models = ctx.getSurfaceModelsByType(ShapeElementModel);
        return models.length === 1 && !hasGrouped(models[0]) && !models[0].text;
      },
      run(ctx) {
        const model = ctx.getCurrentModelByType(ShapeElementModel);
        if (!model) return;

        const rootBlock = getRootBlock(ctx);
        if (!rootBlock) return;

        mountShapeTextEditor(model, rootBlock);
      },
    },
    // id: `g.text`
    ...createTextActions(ShapeElementModel, 'shape', (ctx, model, props) => {
      // No need to adjust element bounds
      if (props['textAlign']) {
        ctx.std.get(EdgelessCRUDIdentifier).updateElement(model.id, props);
        return;
      }

      const xywh = normalizeShapeBound(
        model,
        Bound.fromXYWH(model.deserializedXYWH)
      ).serialize();

      ctx.std
        .get(EdgelessCRUDIdentifier)
        .updateElement(model.id, { ...props, xywh });
    }).map<ToolbarGenericAction>(action => ({
      ...action,
      id: `g.text-${action.id}`,
      when(ctx) {
        const models = ctx.getSurfaceModelsByType(ShapeElementModel);
        return (
          models.length > 0 &&
          models.every(model => !hasGrouped(model) && model.text)
        );
      },
    })),
  ],

  when: ctx => ctx.getSurfaceModelsByType(ShapeElementModel).length > 0,
} as const satisfies ToolbarModuleConfig;

// When the shape is filled with black color, the text color should be white.
// When the shape is transparent, the text color should be set according to the theme.
// Otherwise, the text color should be black.
function getTextColor(fillColor: Color, isNotTransparent = false) {
  if (isNotTransparent) {
    if (isEqual(fillColor, DefaultTheme.black)) {
      return DefaultTheme.white;
    } else if (isEqual(fillColor, DefaultTheme.white)) {
      return DefaultTheme.black;
    } else if (isEqual(fillColor, DefaultTheme.pureBlack)) {
      return DefaultTheme.pureWhite;
    } else if (isEqual(fillColor, DefaultTheme.pureWhite)) {
      return DefaultTheme.pureBlack;
    }
  }

  // aka `DefaultTheme.pureBlack`
  return DefaultTheme.shapeTextColor;
}

export function hasGrouped(model: ShapeElementModel) {
  return model.group instanceof MindmapElementModel;
}

export const shapeToolbarExtension = ToolbarModuleExtension({
  id: BlockFlavourIdentifier('affine:surface:shape'),
  config: shapeToolbarConfig,
});
