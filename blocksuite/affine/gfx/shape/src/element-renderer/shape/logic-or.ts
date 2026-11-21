import { createPathShapeRenderer } from './path-shape.js';
import { buildLogicOrPath } from './paths.js';

export const logicOr = createPathShapeRenderer(buildLogicOrPath);
