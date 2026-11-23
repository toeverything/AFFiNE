import type { EdgelessTextBlockModel } from '../blocks/edgeless-text/edgeless-text-model.js';
import type { BrushElementModel } from './brush/index.js';
import type { ConnectorElementModel } from './connector/index.js';
import type { GroupElementModel } from './group/index.js';
import type { HighlighterElementModel } from './highlighter/index.js';
import type { MindmapElementModel } from './mindmap/index.js';
import type { ShapeElementModel } from './shape/index.js';
import type { TextElementModel } from './text/index.js';

export * from './brush/index.js';
export * from './connector/index.js';
export * from './group/index.js';
export * from './highlighter/index.js';
export * from './mindmap/index.js';
export * from './shape/index.js';
export * from './text/index.js';

export type SurfaceElementModelMap = {
  brush: BrushElementModel;
  highlighter: HighlighterElementModel;
  connector: ConnectorElementModel;
  group: GroupElementModel;
  mindmap: MindmapElementModel;
  shape: ShapeElementModel;
  text: TextElementModel;
};

export type SurfaceTextModelMap = {
  text: TextElementModel;
  connector: ConnectorElementModel;
  shape: ShapeElementModel;
  'edgeless-text': EdgelessTextBlockModel;
};

export type SurfaceTextModel = SurfaceTextModelMap[keyof SurfaceTextModelMap];
