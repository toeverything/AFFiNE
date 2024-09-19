import type { Doc as BlockSuiteDoc } from '@blocksuite/affine/store';

import { Scope } from '../../../framework';
import type { DocRecord } from '../entities/record';

export class DocScope extends Scope<{
  docId: string;
  record: DocRecord;
  blockSuiteDoc: BlockSuiteDoc;
}> {}
