import {
  EdgelessCRUDIdentifier,
  TextUtils,
} from '@blocksuite/affine-block-surface';
import {
  packColor,
  type PickColorEvent,
} from '@blocksuite/affine-components/color-picker';
import { EditorChevronDown } from '@blocksuite/affine-components/toolbar';
import {
  DefaultTheme,
  FontFamily,
  FontStyle,
  FontWeight,
  resolveColor,
  type SurfaceTextModelMap,
  TextAlign,
  type TextStyleProps,
} from '@blocksuite/affine-model';
import {
  type ToolbarActions,
  type ToolbarContext,
} from '@blocksuite/affine-shared/services';
import {
  getMostCommonResolvedValue,
  getMostCommonValue,
} from '@blocksuite/affine-shared/utils';
import {
  type MenuItem,
  renderCurrentMenuItemWith,
  renderMenu,
} from '@blocksuite/affine-widget-edgeless-toolbar';
import {
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
} from '@blocksuite/icons/lit';
import type { GfxModel } from '@blocksuite/std/gfx';
import { signal } from '@preact/signals-core';
import { html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import {
  isFontStyleSupported,
  isFontWeightSupported,
} from '../element-renderer/utils';

const FONT_WEIGHT_LIST = [
  {
    key: 'Light',
    value: FontWeight.Light,
  },
  {
    key: 'Regular',
    value: FontWeight.Regular,
  },
  {
    key: 'Semibold',
    value: FontWeight.SemiBold,
  },
] as const satisfies MenuItem<FontWeight>[];

const FONT_STYLE_LIST = [
  {
    value: FontStyle.Normal,
  },
  {
    key: 'Italic',
    value: FontStyle.Italic,
  },
] as const satisfies MenuItem<FontStyle>[];

const FONT_SIZE_LIST = [
  { value: 16 },
  { value: 24 },
  { value: 32 },
  { value: 40 },
  { value: 64 },
  { value: 128 },
] as const satisfies MenuItem<number>[];

const TEXT_ALIGN_LIST = [
  {
    key: 'Left',
    value: TextAlign.Left,
    icon: TextAlignLeftIcon(),
  },
  {
    key: 'Center',
    value: TextAlign.Center,
    icon: TextAlignCenterIcon(),
  },
  {
    key: 'Right',
    value: TextAlign.Right,
    icon: TextAlignRightIcon(),
  },
] as const satisfies MenuItem<TextAlign>[];

export function createTextActions<
  K extends abstract new (...args: any) => any,
  T extends keyof SurfaceTextModelMap,
>(
  klass: K,
  type: T,
  update: (
    ctx: ToolbarContext,
    model: InstanceType<K>,
    props: Partial<TextStyleProps>
  ) => void = (ctx, model, props) =>
    ctx.std.get(EdgelessCRUDIdentifier).updateElement(model.id, props),
  mapInto: (model: InstanceType<K>) => TextStyleProps = model => model,
  stash: <P extends keyof TextStyleProps>(
    model: InstanceType<K>,
    type: 'stash' | 'pop',
    field: P
  ) => void = (model, type, field) => model[type](field)
) {
  return [
    {
      id: 'a.font',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(klass);
        if (!models.length) return null;
        const allowed = models.every(model =>
          isSurfaceTextModel(model, klass, type)
        );
        if (!allowed) return null;

        const mappedModels = models.map(mapInto);

        const fontFamily =
          getMostCommonValue(mappedModels, 'fontFamily') ?? FontFamily.Inter;
        const styleInfo = { fontFamily: TextUtils.wrapFontFamily(fontFamily) };

        const onPick = (fontFamily: FontFamily) => {
          let fontWeight =
            getMostCommonValue(mappedModels, 'fontWeight') ??
            FontWeight.Regular;
          let fontStyle =
            getMostCommonValue(mappedModels, 'fontStyle') ?? FontStyle.Normal;

          if (!isFontWeightSupported(fontFamily, fontWeight)) {
            fontWeight = FontWeight.Regular;
          }
          if (!isFontStyleSupported(fontFamily, fontStyle)) {
            fontStyle = FontStyle.Normal;
          }

          for (const model of models) {
            update(ctx, model, { fontFamily, fontWeight, fontStyle });
          }
        };

        return html`
          <editor-menu-button
            .contentPadding="${'8px'}"
            .button=${html`
              <editor-icon-button
                aria-label="Font"
                .tooltip="${'Font'}"
                .justify="${'space-between'}"
                .iconContainerWidth="${'40px'}"
              >
                <span class="label padding0" style=${styleMap(styleInfo)}
                  >Aa</span
                >
                ${EditorChevronDown}
              </editor-icon-button>
            `}
          >
            <edgeless-font-family-panel
              .value=${fontFamily}
              .onSelect=${onPick}
            ></edgeless-font-family-panel>
          </editor-menu-button>
        `;
      },
    },
    {
      id: 'b.text-color',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(klass);
        if (!models.length) return null;
        const allowed = models.every(model =>
          isSurfaceTextModel(model, klass, type)
        );
        if (!allowed) return null;

        const enableCustomColor = ctx.features.getFlag('enable_color_picker');
        const theme = ctx.theme.edgeless$.value;

        const palettes =
          type === 'shape'
            ? DefaultTheme.ShapeTextColorPalettes
            : DefaultTheme.Palettes;
        const defaultColor =
          type === 'shape'
            ? DefaultTheme.shapeTextColor
            : DefaultTheme.textColor;

        const mappedModels = models.map(mapInto);

        const field = 'color';
        const firstModel = mappedModels[0];
        const originalColor = firstModel[field];
        const color =
          getMostCommonResolvedValue(mappedModels, field, color =>
            resolveColor(color, theme)
          ) ?? resolveColor(defaultColor, theme);

        const onPick = (e: PickColorEvent) => {
          switch (e.type) {
            case 'pick':
              {
                const color = e.detail.value;
                const props = packColor(field, color);
                models.forEach(model => {
                  update(ctx, model, props);
                });
              }
              break;
            case 'start':
              ctx.store.captureSync();
              models.forEach(model => {
                stash(model, 'stash', field);
              });
              break;
            case 'end':
              ctx.store.transact(() => {
                models.forEach(model => {
                  stash(model, 'pop', field);
                });
              });
              break;
          }
        };

        return html`
          <edgeless-color-picker-button
            class="text-color"
            .label="${'Text color'}"
            .pick=${onPick}
            .color=${color}
            .theme=${theme}
            .isText=${true}
            .hollowCircle=${true}
            .originalColor=${originalColor}
            .palettes=${palettes}
            .enableCustomColor=${enableCustomColor}
          >
          </edgeless-color-picker-button>
        `;
      },
    },
    {
      id: 'c.font-style',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(klass);
        if (!models.length) return null;
        const allowed = models.every(model =>
          isSurfaceTextModel(model, klass, type)
        );
        if (!allowed) return null;

        const fontFamily =
          getMostCommonValue(models.map(mapInto), 'fontFamily') ??
          FontFamily.Inter;
        const fontWeight =
          getMostCommonValue(models.map(mapInto), 'fontWeight') ??
          FontWeight.Regular;
        const fontStyle =
          getMostCommonValue(models.map(mapInto), 'fontStyle') ??
          FontStyle.Normal;
        const matchFontFaces = TextUtils.getFontFacesByFontFamily(fontFamily);
        const disabled =
          matchFontFaces.length === 1 &&
          matchFontFaces[0].style === fontStyle &&
          matchFontFaces[0].weight === fontWeight;

        const onPick = (fontWeight: FontWeight, fontStyle: FontStyle) => {
          for (const model of models) {
            update(ctx, model, { fontWeight, fontStyle });
          }
        };

        return html`
          <editor-menu-button
            .contentPadding="${'8px'}"
            .button=${html`
              <editor-icon-button
                aria-label="Font style"
                .tooltip="${'Font style'}"
                .justify="${'space-between'}"
                .iconContainerWidth="${'90px'}"
                .disabled=${disabled}
              >
                <span class="label ellipsis">
                  ${renderCurrentMenuItemWith(
                    FONT_WEIGHT_LIST,
                    fontWeight,
                    'key'
                  )}
                  ${renderCurrentMenuItemWith(
                    FONT_STYLE_LIST,
                    fontStyle,
                    'key'
                  )}
                </span>
                ${EditorChevronDown}
              </editor-icon-button>
            `}
          >
            <edgeless-font-weight-and-style-panel
              .fontFamily=${fontFamily}
              .fontWeight=${fontWeight}
              .fontStyle=${fontStyle}
              .onSelect=${onPick}
            ></edgeless-font-weight-and-style-panel>
          </editor-menu-button>
        `;
      },
    },
    {
      id: 'd.font-size',
      when: type !== 'edgeless-text',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(klass);
        if (!models.length) return null;
        const allowed = models.every(model =>
          isSurfaceTextModel(model, klass, type)
        );
        if (!allowed) return null;

        const fontSize$ = signal(
          Math.trunc(
            getMostCommonValue(models.map(mapInto), 'fontSize') ??
              FONT_SIZE_LIST[0].value
          )
        );

        const onPick = (e: CustomEvent<number>) => {
          e.stopPropagation();

          const fontSize = e.detail;

          for (const model of models) {
            update(ctx, model, { fontSize });
          }
        };

        return html`<affine-size-dropdown-menu
          @select=${onPick}
          .label="${'Font size'}"
          .sizes=${FONT_SIZE_LIST}
          .size$=${fontSize$}
        ></affine-size-dropdown-menu>`;
      },
    },
    {
      id: 'e.alignment',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(klass);
        if (!models.length) return null;
        const allowed = models.every(model =>
          isSurfaceTextModel(model, klass, type)
        );
        if (!allowed) return null;

        const textAlign =
          getMostCommonValue(models.map(mapInto), 'textAlign') ??
          TextAlign.Left;

        const onPick = (textAlign: TextAlign) => {
          for (const model of models) {
            update(ctx, model, { textAlign });
          }
        };

        return renderMenu({
          label: 'Alignment',
          items: TEXT_ALIGN_LIST,
          currentValue: textAlign,
          onPick,
        });
      },
    },
  ] as const satisfies ToolbarActions;
}

function isSurfaceTextModel<
  K extends abstract new (...args: any) => any,
  T extends keyof SurfaceTextModelMap,
>(model: GfxModel, klass: K, type: T): model is InstanceType<K> {
  return model instanceof klass || ('type' in model && model.type === type);
}
