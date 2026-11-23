import type { IBound } from '@blocksuite/global/gfx';
import type {
  GfxLocalElementModel,
  GfxPrimitiveElementModel,
} from '@blocksuite/std/gfx';

import type { RoughCanvas } from '../../index.js';
import type { CanvasRenderer } from '../canvas-renderer.js';

export type ElementRenderer<
  T extends GfxPrimitiveElementModel | GfxLocalElementModel =
    GfxPrimitiveElementModel,
> = (
  model: T,
  ctx: CanvasRenderingContext2D,
  matrix: DOMMatrix,
  renderer: CanvasRenderer,
  rc: RoughCanvas,
  viewportBound: IBound
) => void;

export const elementRendererExtensions = [];
