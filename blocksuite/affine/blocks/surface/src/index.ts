// oxlint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./effects.ts" />
export * from './consts.js';
export { GRID_GAP_MAX, GRID_GAP_MIN } from './consts.js';
export {
  SurfaceElementModel,
  SurfaceGroupLikeModel,
} from './element-model/base.js';
export { CanvasElementType } from './element-model/index.js';
export { CanvasRenderer } from './renderer/canvas-renderer.js';
export { DomRenderer } from './renderer/dom-renderer.js';
export type { ElementRenderer } from './renderer/elements/index.js';
export * from './renderer/elements/type.js';
export { Overlay, OverlayIdentifier } from './renderer/overlay.js';
export { ToolOverlay } from './renderer/tool-overlay.js';
import {
  getFontFaces,
  getFontFacesByFontFamily,
  isSameFontFamily,
  wrapFontFamily,
} from './utils/font.js';
export * from './adapters/index.js';
export * from './extensions';
export type { SurfaceContext } from './surface-block.js';
export { SurfaceBlockComponent } from './surface-block.js';
export {
  SurfaceBlockModel,
  SurfaceBlockSchema,
  SurfaceBlockSchemaExtension,
} from './surface-model.js';
export { SurfaceBlockTransformer } from './surface-transformer.js';
export * from './tool/default-tool.js';
export {
  generateElementId,
  getBgGridGap,
  getLastPropsKey,
  getSurfaceBlock,
  getSurfaceComponent,
  normalizeWheelDeltaY,
} from './utils';
export { AStarRunner } from './utils/a-star.js';
export { RoughCanvas } from './utils/rough/canvas.js';
export type { Options } from './utils/rough/core';
export { sortIndex } from './utils/sort';
export { updateXYWH } from './utils/update-xywh.js';

export const TextUtils = {
  wrapFontFamily,
  getFontFaces,
  getFontFacesByFontFamily,
  isSameFontFamily,
};

export * from './commands';
