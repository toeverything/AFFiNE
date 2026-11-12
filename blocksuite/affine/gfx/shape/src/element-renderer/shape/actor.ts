import { createPathShapeRenderer } from './path-shape.js';
import { buildActorPath } from './paths.js';

export const actor = createPathShapeRenderer(buildActorPath);
