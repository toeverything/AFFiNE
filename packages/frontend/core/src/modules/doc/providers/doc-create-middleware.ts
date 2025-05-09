import { createIdentifier } from '@toeverything/infra';

import type { DocRecord } from '../entities/record';
import type { DocCreateOptions } from '../types';

export interface DocCreateMiddleware {
  beforeCreate?: (docCreateOptions: DocCreateOptions) => DocCreateOptions;
  afterCreate?: (doc: DocRecord, docCreateOptions: DocCreateOptions) => void;
}

export const DocCreateMiddleware = createIdentifier<DocCreateMiddleware>(
  'DocCreateMiddleware'
);
