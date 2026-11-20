import { createPathShapeRenderer } from './path-shape.js';
import { buildLogicAndPath } from './paths.js';

export const logicAnd = createPathShapeRenderer(buildLogicAndPath);
