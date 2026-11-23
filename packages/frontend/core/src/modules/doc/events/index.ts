import { createEvent } from '@toeverything/infra';

import type { Doc } from '../entities/doc';
import type { DocRecord } from '../entities/record';
import type { DocCreateOptions } from '../types';

export const DocCreated = createEvent<{
  doc: DocRecord;
  docCreateOptions: DocCreateOptions;
}>('DocCreated');

export const DocInitialized = createEvent<Doc>('DocInitialized');
