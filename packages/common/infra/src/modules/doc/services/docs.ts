import { Unreachable } from '@affine/env/constant';
import { type DocMode } from '@blocksuite/affine/blocks';

import { Service } from '../../../framework';
import { type DocProps, initDocFromProps } from '../../../initialization';
import { ObjectPool } from '../../../utils';
import type { Doc } from '../entities/doc';
import { DocPropertyList } from '../entities/property-list';
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

  propertyList = this.framework.createEntity(DocPropertyList);

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
      primaryMode?: DocMode;
      docProps?: DocProps;
    } = {}
  ) {
    const doc = this.store.createBlockSuiteDoc();
    initDocFromProps(doc, options.docProps);
    this.store.markDocSyncStateAsReady(doc.id);
    const docRecord = this.list.doc$(doc.id).value;
    if (!docRecord) {
      throw new Unreachable();
    }
    if (options.primaryMode) {
      docRecord.setPrimaryMode(options.primaryMode);
    }
    return docRecord;
  }

  async addLinkedDoc(targetDocId: string, linkedDocId: string) {
    const { doc, release } = this.open(targetDocId);
    doc.setPriorityLoad(10);
    await doc.waitForSyncReady();
    const text = doc.blockSuiteDoc.Text.fromDelta([
      {
        insert: ' ',
        attributes: {
          reference: {
            type: 'LinkedPage',
            pageId: linkedDocId,
          },
        },
      },
    ]);
    const [frame] = doc.blockSuiteDoc.getBlocksByFlavour('affine:note');
    frame &&
      doc.blockSuiteDoc.addBlock(
        'affine:paragraph' as never, // TODO(eyhn): fix type
        { text },
        frame.id
      );
    release();
  }

  async changeDocTitle(docId: string, newTitle: string) {
    const { doc, release } = this.open(docId);
    doc.setPriorityLoad(10);
    await doc.waitForSyncReady();
    doc.changeDocTitle(newTitle);
    release();
  }
}
