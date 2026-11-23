import type { SerializedXYWH } from '@blocksuite/affine/global/gfx';
import type { MindmapStyle } from '@blocksuite/affine/model';
import type { GfxModel } from '@blocksuite/affine/std/gfx';

import type { TemplateImage } from '../slides/template';

export interface ContextValue {
  selectedElements?: GfxModel[];
  content?: string;
  // make it real
  width?: number;
  height?: number;
  // mindmap
  node?: MindMapNode | null;
  style?: MindmapStyle;
  centerPosition?: SerializedXYWH;
  // slides
  contents?: Array<{ blocks: AffineNode }>;
  images?: TemplateImage[][];
}

export interface AffineNode {
  id: string;
  flavour: string;
  children: AffineNode[];
}

type MindMapNode = {
  xywh?: SerializedXYWH;
  text: string;
  children: MindMapNode[];
};

export class AIContext {
  private _value: ContextValue;

  constructor(initData: ContextValue = {}) {
    this._value = initData;
  }

  get = () => {
    return this._value;
  };

  set = (data: ContextValue) => {
    this._value = {
      ...this._value,
      ...data,
    };
  };
}
