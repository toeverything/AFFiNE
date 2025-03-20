import {
  MindmapStyleFour,
  MindmapStyleOne,
  MindmapStyleThree,
  MindmapStyleTwo,
} from '@blocksuite/affine-block-surface';
import {
  LayoutType,
  MindmapElementModel,
  MindmapStyle,
} from '@blocksuite/affine-model';
import type {
  ToolbarContext,
  ToolbarModuleConfig,
} from '@blocksuite/affine-shared/services';
import { getMostCommonValue } from '@blocksuite/affine-shared/utils';
import { RadiantIcon, RightLayoutIcon, StyleIcon } from '@blocksuite/icons/lit';

import type { MenuItem } from './types';
import { renderMenu } from './utils';

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

export const builtinMindmapToolbarConfig = {
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
