import { Unreachable } from '@affine/env/constant';

import { Service } from '../../../framework';
import { initEmptyPage } from '../../../initialization';
import { ObjectPool } from '../../../utils';
import type { Doc } from '../entities/doc';
import type { DocMode } from '../entities/record';
import { DocRecordList } from '../entities/record-list';
import { DocScope } from '../scopes/doc';
import type { DocsStore } from '../stores/docs';
import { DocService } from './doc';

export class DocsService extends Service {
  list = this.framework.createEntity(DocRecordList);

  pool = new ObjectPool<string, Doc>({
    onDelete(obj) {
      obj.scope.dispose();
    },
  });

  constructor(private readonly store: DocsStore) {
    super();
  }

  open(docId: string) {
    const docRecord = this.list.doc$(docId).value;
    if (!docRecord) {
      throw new Error('Doc record not found');
    }
    const blockSuiteDoc = this.store.getBlockSuiteDoc(docId);
    if (!blockSuiteDoc) {
      throw new Error('Doc not found');
    }

    const exists = this.pool.get(docId);
    if (exists) {
      return { doc: exists.obj, release: exists.release };
    }

    const docScope = this.framework.createScope(DocScope, {
      docId,
      blockSuiteDoc,
      record: docRecord,
    });

    const doc = docScope.get(DocService).doc;

    const { obj, release } = this.pool.put(docId, doc);

    return { doc: obj, release };
  }

  createDoc(
    options: {
      mode?: DocMode;
      title?: string;
    } = {}
  ) {
    const doc = this.store.createBlockSuiteDoc();
    initEmptyPage(doc, options.title);
    const docRecord = this.list.doc$(doc.id).value;
    if (!docRecord) {
      throw new Unreachable();
    }
    if (options.mode) {
      docRecord.setMode(options.mode);
    }
    return docRecord;
  }
}
