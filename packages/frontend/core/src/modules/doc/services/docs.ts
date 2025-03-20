import { DebugLogger } from '@affine/debug';
import { Unreachable } from '@affine/env/constant';
import type { DocMode } from '@blocksuite/affine/model';
import { replaceIdMiddleware } from '@blocksuite/affine/shared/adapters';
import type { AffineTextAttributes } from '@blocksuite/affine/shared/types';
import type { DeltaInsert } from '@blocksuite/affine/store';
import { Slice, Text, Transformer } from '@blocksuite/affine/store';
import { LiveData, ObjectPool, Service } from '@toeverything/infra';
import { omitBy } from 'lodash-es';
import { combineLatest, map } from 'rxjs';

import {
  type DocProps,
  initDocFromProps,
} from '../../../blocksuite/initialization';
import type { DocProperties } from '../../db';
import { getAFFiNEWorkspaceSchema } from '../../workspace';
import type { Doc } from '../entities/doc';
import { DocPropertyList } from '../entities/property-list';
import { DocRecordList } from '../entities/record-list';
import { DocCreated, DocInitialized } from '../events';
import { DocScope } from '../scopes/doc';
import type { DocPropertiesStore } from '../stores/doc-properties';
import type { DocsStore } from '../stores/docs';
import { DocService } from './doc';

const logger = new DebugLogger('DocsService');

export class DocsService extends Service {
  list = this.framework.createEntity(DocRecordList);

  pool = new ObjectPool<string, Doc>({
    onDelete(obj) {
      obj.scope.dispose();
    },
  });

  propertyList = this.framework.createEntity(DocPropertyList);

  /**
   * used for search doc by properties, for convenience of search, all non-exist doc or trash doc have been filtered
   */
  allDocProperties$: LiveData<Record<string, DocProperties>> = LiveData.from(
    combineLatest([
      this.docPropertiesStore.watchAllDocProperties(),
      this.store.watchNonTrashDocIds(),
    ]).pipe(
      map(([properties, docIds]) => {
        const allIds = new Set(docIds);
        return omitBy(
          properties as Record<string, DocProperties>,
          (_, id) => !allIds.has(id)
        );
      })
    ),
    {}
  );

  constructor(
    private readonly store: DocsStore,
    private readonly docPropertiesStore: DocPropertiesStore
  ) {
    super();
  }

  loaded(docId: string) {
    const exists = this.pool.get(docId);
    if (exists) {
      return { doc: exists.obj, release: exists.release };
    }
    return null;
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

    try {
      blockSuiteDoc.load();
    } catch (e) {
      logger.error('Failed to load doc', {
        docId,
        error: e,
      });
    }

    const doc = docScope.get(DocService).doc;

    doc.scope.emitEvent(DocInitialized, doc);

    const { obj, release } = this.pool.put(docId, doc);

    return { doc: obj, release };
  }

  createDoc(
    options: {
      primaryMode?: DocMode;
      docProps?: DocProps;
      isTemplate?: boolean;
    } = {}
  ) {
    const doc = this.store.createBlockSuiteDoc();
    initDocFromProps(doc, options.docProps);
    const docRecord = this.list.doc$(doc.id).value;
    if (!docRecord) {
      throw new Unreachable();
    }
    if (options.primaryMode) {
      docRecord.setPrimaryMode(options.primaryMode);
    }
    if (options.isTemplate) {
      docRecord.setProperty('isTemplate', true);
    }
    this.eventBus.emit(DocCreated, docRecord);
    return docRecord;
  }

  async addLinkedDoc(targetDocId: string, linkedDocId: string) {
    const { doc, release } = this.open(targetDocId);
    const disposePriorityLoad = doc.addPriorityLoad(10);
    await doc.waitForSyncReady();
    disposePriorityLoad();
    const text = new Text([
      {
        insert: ' ',
        attributes: {
          reference: {
            type: 'LinkedPage',
            pageId: linkedDocId,
          },
        },
      },
    ] as DeltaInsert<AffineTextAttributes>[]);
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
    const disposePriorityLoad = doc.addPriorityLoad(10);
    await doc.waitForSyncReady();
    disposePriorityLoad();
    doc.changeDocTitle(newTitle);
    release();
  }

  /**
   * Duplicate a doc from template
   * @param sourceDocId - the id of the source doc to be duplicated
   * @param _targetDocId - the id of the target doc to be duplicated, if not provided, a new doc will be created
   * @returns the id of the new doc
   */
  async duplicateFromTemplate(sourceDocId: string, _targetDocId?: string) {
    const targetDocId = _targetDocId ?? this.createDoc().id;

    // check if source doc is removed
    if (this.list.doc$(sourceDocId).value?.trash$.value) {
      console.warn(
        `Template doc(id: ${sourceDocId}) is removed, skip duplicate`
      );
      return targetDocId;
    }

    const { release: sourceRelease, doc: sourceDoc } = this.open(sourceDocId);
    const { release: targetRelease, doc: targetDoc } = this.open(targetDocId);
    await sourceDoc.waitForSyncReady();

    // duplicate doc content
    try {
      const sourceBsDoc = this.store.getBlockSuiteDoc(sourceDocId);
      const targetBsDoc = this.store.getBlockSuiteDoc(targetDocId);
      if (!sourceBsDoc) throw new Error('Source doc not found');
      if (!targetBsDoc) throw new Error('Target doc not found');

      // clear the target doc (both surface and note)
      targetBsDoc.root?.children.forEach(child =>
        targetBsDoc.deleteBlock(child)
      );

      const collection = this.store.getBlocksuiteCollection();
      const transformer = new Transformer({
        schema: getAFFiNEWorkspaceSchema(),
        blobCRUD: collection.blobSync,
        docCRUD: {
          create: (id: string) => collection.createDoc({ id }),
          get: (id: string) => collection.getDoc(id),
          delete: (id: string) => collection.removeDoc(id),
        },
        middlewares: [replaceIdMiddleware(collection.idGenerator)],
      });
      const slice = Slice.fromModels(sourceBsDoc, [
        ...(sourceBsDoc.root?.children ?? []),
      ]);
      const snapshot = transformer.sliceToSnapshot(slice);
      if (!snapshot) {
        throw new Error('Failed to create snapshot');
      }
      await transformer.snapshotToSlice(
        snapshot,
        targetBsDoc,
        targetBsDoc.root?.id
      );
    } catch (e) {
      logger.error('Failed to duplicate doc', {
        sourceDocId,
        targetDocId,
        originalTargetDocId: _targetDocId,
        error: e,
      });
    } finally {
      sourceRelease();
      targetRelease();
    }

    // duplicate doc properties
    const properties = sourceDoc.getProperties();
    const removedProperties = ['id', 'isTemplate', 'journal'];
    removedProperties.forEach(key => {
      delete properties[key];
    });
    targetDoc.updateProperties(properties);

    return targetDocId;
  }
}
