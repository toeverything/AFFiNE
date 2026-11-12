import { createPathShapeRenderer } from './path-shape.js';
import { buildCalloutPath } from './paths.js';

export const callout = createPathShapeRenderer(buildCalloutPath);
