import { createPathShapeRenderer } from './path-shape.js';
import { buildDocumentPath } from './paths.js';

export const document = createPathShapeRenderer(buildDocumentPath);
