import { createPathShapeRenderer } from './path-shape.js';
import { buildCubePath } from './paths.js';

export const cube = createPathShapeRenderer(buildCubePath);
