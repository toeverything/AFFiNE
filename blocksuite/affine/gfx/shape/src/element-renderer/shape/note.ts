import { createPathShapeRenderer } from './path-shape.js';
import { buildNoteFoldPaths, buildNotePath } from './paths.js';

export const note = createPathShapeRenderer(
  buildNotePath,
  undefined,
  buildNoteFoldPaths
);
