import { createPathShapeRenderer } from './path-shape.js';
import { buildCylinderPath } from './paths.js';

export const cylinder = createPathShapeRenderer(buildCylinderPath);
