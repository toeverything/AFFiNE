import { createPathShapeRenderer } from './path-shape.js';
import { buildInternalStoragePath } from './paths.js';

export const internalStorage = createPathShapeRenderer(
  buildInternalStoragePath
);
