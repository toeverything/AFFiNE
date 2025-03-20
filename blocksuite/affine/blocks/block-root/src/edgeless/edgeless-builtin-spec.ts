import {
  FrameHighlightManager,
  FrameTool,
  PresentTool,
} from '@blocksuite/affine-block-frame';
import { ConnectionOverlay } from '@blocksuite/affine-block-surface';
import { TextTool } from '@blocksuite/affine-gfx-text';
import {
  CanvasEventHandler,
  ElementTransformManager,
} from '@blocksuite/block-std/gfx';
import type { ExtensionType } from '@blocksuite/store';

import { EdgelessElementToolbarExtension } from './configs/toolbar';
import { EdgelessRootBlockSpec } from './edgeless-root-spec.js';
import { ConnectorFilter } from './element-transform/connector-filter.js';
import { MindMapDragExtension } from './element-transform/mind-map-drag.js';
import { SnapExtension } from './element-transform/snap-manager.js';
import { MindMapIndicatorOverlay } from './element-transform/utils/indicator-overlay.js';
import { BrushTool } from './gfx-tool/brush-tool.js';
import { ConnectorTool } from './gfx-tool/connector-tool.js';
import { DefaultTool } from './gfx-tool/default-tool.js';
import { EmptyTool } from './gfx-tool/empty-tool.js';
import { EraserTool } from './gfx-tool/eraser-tool.js';
import { LassoTool } from './gfx-tool/lasso-tool.js';
import { NoteTool } from './gfx-tool/note-tool.js';
import { PanTool } from './gfx-tool/pan-tool.js';
import { ShapeTool } from './gfx-tool/shape-tool.js';
import { TemplateTool } from './gfx-tool/template-tool.js';
import { EditPropsMiddlewareBuilder } from './middlewares/base.js';
import { SnapOverlay } from './utils/snap-manager.js';

export const EdgelessToolExtension: ExtensionType[] = [
  DefaultTool,
  PanTool,
  EraserTool,
  TextTool,
  ShapeTool,
  NoteTool,
  BrushTool,
  ConnectorTool,
  TemplateTool,
  EmptyTool,
  FrameTool,
  LassoTool,
  PresentTool,
];

export const EdgelessEditExtensions: ExtensionType[] = [
  ElementTransformManager,
  ConnectorFilter,
  SnapExtension,
  CanvasEventHandler,
  MindMapDragExtension,
  FrameHighlightManager,
];

export const EdgelessBuiltInManager: ExtensionType[] = [
  ConnectionOverlay,
  MindMapIndicatorOverlay,
  SnapOverlay,
  EditPropsMiddlewareBuilder,
  EdgelessElementToolbarExtension,
].flat();

export const EdgelessBuiltInSpecs: ExtensionType[] = [
  EdgelessRootBlockSpec,
  EdgelessToolExtension,
  EdgelessBuiltInManager,
  EdgelessEditExtensions,
].flat();
