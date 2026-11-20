import { createPathShapeRenderer } from './path-shape.js';
import { buildCloudPath } from './paths.js';

export const cloud = createPathShapeRenderer(buildCloudPath);
