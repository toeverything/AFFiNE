import { createPathShapeRenderer } from './path-shape.js';
import { buildTapePath } from './paths.js';

export const tape = createPathShapeRenderer(buildTapePath);
