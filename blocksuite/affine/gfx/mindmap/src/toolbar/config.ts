import { hasGrouped } from '@blocksuite/affine-gfx-shape';
import {
  LayoutType,
  MindmapElementModel,
  MindmapStyle,
  ShapeElementModel,
} from '@blocksuite/affine-model';
import {
  type ToolbarContext,
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { getMostCommonValue } from '@blocksuite/affine-shared/utils';
import {
  type MenuItem,
  renderMenu,
} from '@blocksuite/affine-widget-edgeless-toolbar';
import { RadiantIcon, RightLayoutIcon, StyleIcon } from '@blocksuite/icons/lit';
import { BlockFlavourIdentifier } from '@blocksuite/std';

import {
  MindmapStyleFour,
  MindmapStyleOne,
  MindmapStyleThree,
  MindmapStyleTwo,
} from '../view/index';

const MINDMAP_STYLE_LIST = [
  {
    value: MindmapStyle.ONE,
    icon: MindmapStyleOne,
  },
  {
    value: MindmapStyle.FOUR,
    icon: MindmapStyleFour,
  },
  {
    value: MindmapStyle.THREE,
    icon: MindmapStyleThree,
  },
  {
    value: MindmapStyle.TWO,
    icon: MindmapStyleTwo,
  },
] as const satisfies MenuItem<MindmapStyle>[];

const MINDMAP_LAYOUT_LIST = [
  {
    key: 'Left',
    value: LayoutType.LEFT,
    icon: RightLayoutIcon({
      style: 'transform: rotate(0.5turn); transform-origin: center;',
    }),
  },
  {
    key: 'Radial',
    value: LayoutType.BALANCE,
    icon: RadiantIcon(),
  },
  {
    key: 'Right',
    value: LayoutType.RIGHT,
    icon: RightLayoutIcon(),
  },
] as const satisfies MenuItem<LayoutType>[];

export const createMindmapStyleActionMenu = (
  ctx: ToolbarContext,
  models: MindmapElementModel[]
) => {
  const style = getMostCommonValue(models, 'style') ?? MindmapStyle.ONE;
  const onPick = (style: MindmapStyle) => {
    for (const model of models) {
      model.style = style;
    }
    ctx.settings.recordLastProps('mindmap', { style });
  };

  return renderMenu({
    label: 'Style',
    icon: StyleIcon(),
    items: MINDMAP_STYLE_LIST,
    currentValue: style,
    onPick,
  });
};

export const createMindmapLayoutActionMenu = (
  ctx: ToolbarContext,
  models: MindmapElementModel[]
) => {
  const layoutType =
    getMostCommonValue(models, 'layoutType') ?? LayoutType.BALANCE;
  const onPick = (layoutType: LayoutType) => {
    for (const model of models) {
      model.layoutType = layoutType;
      model.layout();
    }
    ctx.settings.recordLastProps('mindmap', { layoutType });
  };

  return renderMenu({
    label: 'Layout',
    items: MINDMAP_LAYOUT_LIST,
    currentValue: layoutType,
    onPick,
  });
};

export const mindmapToolbarConfig = {
  actions: [
    {
      id: 'a.style',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(MindmapElementModel);
        if (!models.length) return null;

        return createMindmapStyleActionMenu(ctx, models);
      },
    },
    {
      id: 'b.layout',
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(MindmapElementModel);
        if (!models.length) return null;

        return createMindmapLayoutActionMenu(ctx, models);
      },
    },
  ],

  when: ctx => ctx.getSurfaceModelsByType(MindmapElementModel).length > 0,
} as const satisfies ToolbarModuleConfig;

export const shapeMindmapToolbarConfig = {
  actions: [
    {
      id: 'a.mindmap-style',
      when(ctx) {
        const models = ctx.getSurfaceModelsByType(ShapeElementModel);
        return models.some(hasGrouped);
      },
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(ShapeElementModel);
        if (!models.length) return null;

        let mindmaps = models
          .map(model => model.group)
          .filter(model => ctx.matchModel(model, MindmapElementModel));
        if (!mindmaps.length) return null;

        // Not displayed when there is both a normal shape and a mindmap shape.
        if (models.length !== mindmaps.length) return null;

        mindmaps = Array.from(new Set(mindmaps));

        return createMindmapStyleActionMenu(ctx, mindmaps);
      },
    },
    {
      id: 'b.mindmap-layout',
      when(ctx) {
        const models = ctx.getSurfaceModelsByType(ShapeElementModel);
        return models.some(hasGrouped);
      },
      content(ctx) {
        const models = ctx.getSurfaceModelsByType(ShapeElementModel);
        if (!models.length) return null;

        let mindmaps = models
          .map(model => model.group)
          .filter(model => ctx.matchModel(model, MindmapElementModel));
        if (!mindmaps.length) return null;

        // Not displayed when there is both a normal shape and a mindmap shape.
        if (models.length !== mindmaps.length) return null;

        mindmaps = Array.from(new Set(mindmaps));

        // It's a sub node.
        if (models.length === 1 && mindmaps[0].tree.element !== models[0])
          return null;

        return createMindmapLayoutActionMenu(ctx, mindmaps);
      },
    },
  ],
  when: ctx => ctx.getSurfaceModelsByType(ShapeElementModel).length > 0,
} as const satisfies ToolbarModuleConfig;

export const mindmapToolbarExtension = ToolbarModuleExtension({
  id: BlockFlavourIdentifier('affine:surface:mindmap'),
  config: mindmapToolbarConfig,
});

export const shapeMindmapToolbarExtension = ToolbarModuleExtension({
  id: BlockFlavourIdentifier('custom:affine:surface:shape'),
  config: shapeMindmapToolbarConfig,
});
