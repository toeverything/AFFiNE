import { ColorScheme, MindmapStyle } from '@blocksuite/affine-model';
import type { TemplateResult } from 'lit';

import { type DraggableTool, getMindmapRender } from './basket-elements.js';
import {
  mindMapStyle1Dark,
  mindMapStyle1Light,
  mindMapStyle2Dark,
  mindMapStyle2Light,
  mindMapStyle3,
  mindMapStyle4,
} from './icons.js';

export type ToolbarMindmapItem = {
  type: 'mindmap';
  icon: TemplateResult;
  style: MindmapStyle;
  render: DraggableTool['render'];
};

export const getMindMaps = (theme: ColorScheme): ToolbarMindmapItem[] => [
  {
    type: 'mindmap',
    icon: theme === ColorScheme.Dark ? mindMapStyle1Dark : mindMapStyle1Light,
    style: MindmapStyle.ONE,
    render: getMindmapRender(MindmapStyle.ONE),
  },
  {
    type: 'mindmap',
    icon: mindMapStyle4,
    style: MindmapStyle.FOUR,
    render: getMindmapRender(MindmapStyle.FOUR),
  },
  {
    type: 'mindmap',
    icon: mindMapStyle3,
    style: MindmapStyle.THREE,
    render: getMindmapRender(MindmapStyle.THREE),
  },
  {
    type: 'mindmap',
    icon: theme === 'light' ? mindMapStyle2Light : mindMapStyle2Dark,
    style: MindmapStyle.TWO,
    render: getMindmapRender(MindmapStyle.TWO),
  },
];
