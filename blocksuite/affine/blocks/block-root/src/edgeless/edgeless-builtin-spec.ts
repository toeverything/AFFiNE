import {
  FrameHighlightManager,
  FrameTool,
  PresentTool,
} from '@blocksuite/affine-block-frame';
import { ConnectionOverlay } from '@blocksuite/affine-block-surface';
import { BrushTool, EraserTool } from '@blocksuite/affine-gfx-brush';
import {
  ConnectorFilter,
  ConnectorTool,
} from '@blocksuite/affine-gfx-connector';
import {
  MindMapDragExtension,
  MindMapIndicatorOverlay,
} from '@blocksuite/affine-gfx-mindmap';
import { NoteTool } from '@blocksuite/affine-gfx-note';
import { ShapeTool } from '@blocksuite/affine-gfx-shape';
import { TextTool } from '@blocksuite/affine-gfx-text';
import { ElementTransformManager } from '@blocksuite/block-std/gfx';
import type { ExtensionType } from '@blocksuite/store';

import { EdgelessElementToolbarExtension } from './configs/toolbar';
import { EdgelessRootBlockSpec } from './edgeless-root-spec.js';
import { DblClickAddEdgelessText } from './element-transform/dblclick-add-edgeless-text.js';
import { SnapExtension } from './element-transform/snap-manager.js';
import { DefaultTool } from './gfx-tool/default-tool.js';
import { EmptyTool } from './gfx-tool/empty-tool.js';
import { LassoTool } from './gfx-tool/lasso-tool.js';
import { PanTool } from './gfx-tool/pan-tool.js';
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
  MindMapDragExtension,
  FrameHighlightManager,
  DblClickAddEdgelessText,
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
