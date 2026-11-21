import { createPathShapeRenderer } from './path-shape.js';
import { buildCubeInnerPaths, buildCubePath } from './paths.js';

export const cube = createPathShapeRenderer(
  buildCubePath,
  undefined,
  buildCubeInnerPaths
);
