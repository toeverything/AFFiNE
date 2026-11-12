import { createPathShapeRenderer } from './path-shape.js';
import { buildStepPath } from './paths.js';

export const step = createPathShapeRenderer(buildStepPath);
