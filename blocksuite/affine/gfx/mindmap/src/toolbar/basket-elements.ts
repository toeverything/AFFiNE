import { addAttachments } from '@blocksuite/affine-block-attachment';
import { addImages } from '@blocksuite/affine-block-image';
import {
  CanvasElementType,
  EdgelessCRUDIdentifier,
} from '@blocksuite/affine-block-surface';
import {
  insertEdgelessTextCommand,
  mountTextElementEditor,
} from '@blocksuite/affine-gfx-text';
import {
  MAX_IMAGE_WIDTH,
  type MindmapStyle,
  TextElementModel,
} from '@blocksuite/affine-model';
import {
  FeatureFlagService,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import { openSingleFileWith } from '@blocksuite/affine-shared/utils';
import { Bound, type IVec } from '@blocksuite/global/gfx';
import type { BlockComponent } from '@blocksuite/std';
import type { TemplateResult } from 'lit';
import * as Y from 'yjs';

export type ConfigProperty = 'x' | 'y' | 'r' | 's' | 'z' | 'o';
export type ConfigState = 'default' | 'active' | 'hover' | 'next';
export type ConfigStyle = Partial<Record<ConfigProperty, number | string>>;
export type ToolConfig = Record<ConfigState, ConfigStyle>;

export type DraggableTool = {
  name: 'text' | 'mindmap' | 'media';
  icon: TemplateResult;
  config: ToolConfig;
  standardWidth?: number;
  render: (bound: Bound, edgeless: BlockComponent) => Promise<string | null>;
};

const unitMap = { x: 'px', y: 'px', r: 'deg', s: '', z: '', o: '' };
export const textConfig: ToolConfig = {
  default: { x: -20, y: -8, r: 7.74, s: 0.92, z: 3 },
  active: { x: -22, y: -9, r: -8, s: 0.92 },
  hover: { x: -22, y: -9, r: -8, s: 1, z: 3 },
  next: { x: -22, y: 64, r: 0 },
};
export const mindmapConfig: ToolConfig = {
  default: { x: 4, y: -4, s: 1, r: -7, z: 2 },
  active: { x: 11, y: -14, r: 9, s: 1 },
  hover: { x: 11, y: -14, r: 9, s: 1.16, z: 3 },
  next: { y: 64, r: 0 },
};
export const mediaConfig: ToolConfig = {
  default: { x: -20, y: -15, r: 23, s: 1.2, z: 1 },
  active: { x: -25, y: -20, r: -9, s: 1.2 },
  hover: { x: -25, y: -20, r: -9, s: 1.5, z: 3 },
  next: { y: 64, r: 0 },
};

export const getMindmapRender =
  (mindmapStyle: MindmapStyle): DraggableTool['render'] =>
  async (bound, edgeless) => {
    const [x, y, _, h] = bound.toXYWH();

    const rootW = 145;
    const rootH = 50;

    const nodeW = 80;
    const nodeH = 35;

    const centerVertical = y + h / 2;
    const rootX = x;
    const rootY = centerVertical - rootH / 2;

    type MindMapNode = {
      children: MindMapNode[];
      text: string;
      xywh: string;
    };

    const root: MindMapNode = {
      children: [],
      text: 'Mind Map',
      xywh: `[${rootX},${rootY},${rootW},${rootH}]`,
    };

    for (let i = 0; i < 3; i++) {
      const nodeX = x + rootW + 300;
      const nodeY = centerVertical - nodeH / 2 + (i - 1) * 50;
      root.children.push({
        children: [],
        text: 'Text',
        xywh: `[${nodeX},${nodeY},${nodeW},${nodeH}]`,
      });
    }

    const crud = edgeless.std.get(EdgelessCRUDIdentifier);
    const mindmapId = crud.addElement('mindmap', {
      style: mindmapStyle,
      children: root,
    }) as string;

    edgeless.std.getOptional(TelemetryProvider)?.track('CanvasElementAdded', {
      control: 'toolbar:dnd', // for now we use toolbar:dnd for all mindmap creation here
      page: 'whiteboard editor',
      module: 'toolbar',
      segment: 'toolbar',
      type: 'mindmap',
    });

    return mindmapId;
  };

export const textRender: DraggableTool['render'] = async (bound, edgeless) => {
  const vCenter = bound.y + bound.h / 2;
  const w = 100;
  const h = 32;

  const flag = edgeless.store
    .get(FeatureFlagService)
    .getFlag('enable_edgeless_text');
  let id: string;
  if (flag) {
    const [_, { textId }] = edgeless.std.command.exec(
      insertEdgelessTextCommand,
      {
        x: bound.x,
        y: vCenter - h / 2,
      }
    );
    id = textId!;
  } else {
    const crud = edgeless.std.get(EdgelessCRUDIdentifier);
    id = crud.addElement(CanvasElementType.TEXT, {
      xywh: new Bound(bound.x, vCenter - h / 2, w, h).serialize(),
      text: new Y.Text(),
    }) as string;

    edgeless.store.captureSync();
    const textElement = crud.getElementById(id);
    if (!(textElement instanceof TextElementModel)) {
      console.error('Cannot mount text editor on a non-text element');
      return null;
    }
    mountTextElementEditor(textElement, edgeless);
  }

  edgeless.std.getOptional(TelemetryProvider)?.track('CanvasElementAdded', {
    control: 'toolbar:dnd',
    page: 'whiteboard editor',
    module: 'toolbar',
    segment: 'toolbar',
    type: 'text',
  });

  return id;
};

export const mediaRender: DraggableTool['render'] = async (bound, edgeless) => {
  let file: File | null = null;
  try {
    file = await openSingleFileWith();
  } catch (e) {
    console.error(e);
    return null;
  }
  if (!file) return null;

  const files = [file];
  const std = edgeless.std;
  const point: IVec = [bound.x, bound.y];

  // image
  if (file.type.startsWith('image/')) {
    const [id] = await addImages(std, files, {
      point,
      maxWidth: MAX_IMAGE_WIDTH,
      shouldTransformPoint: false,
    });
    return id;
  }

  // attachment
  const [id] = await addAttachments(std, files, point, false);
  return id;
};

const toolStyle2StyleObj = (state: ConfigState, style: ConfigStyle = {}) => {
  const styleObj = {} as Record<string, string>;
  for (const [key, value] of Object.entries(style)) {
    styleObj[`--${state}-${key}`] = `${value}${unitMap[key as ConfigProperty]}`;
  }
  return styleObj;
};
export const toolConfig2StyleObj = (config: ToolConfig) => {
  const styleObj = {} as Record<string, string>;
  for (const [state, style] of Object.entries(config)) {
    Object.assign(
      styleObj,
      toolStyle2StyleObj(state as ConfigState, {
        ...config.default,
        ...style,
      })
    );
  }
  return styleObj;
};
