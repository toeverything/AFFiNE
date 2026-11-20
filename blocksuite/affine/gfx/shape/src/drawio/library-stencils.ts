import type { StencilShapeData } from './stencil-utils.js';
import { drawioLibraryStencilShapesA } from './library-stencils-a.js';
import { drawioLibraryStencilShapesBM } from './library-stencils-bm.js';
import { drawioLibraryStencilShapesNZ } from './library-stencils-nz.js';

export const drawioLibraryStencilShapes: Record<string, StencilShapeData> = {
  ...drawioLibraryStencilShapesA,
  ...drawioLibraryStencilShapesBM,
  ...drawioLibraryStencilShapesNZ,
};
