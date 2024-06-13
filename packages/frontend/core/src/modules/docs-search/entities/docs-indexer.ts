import { DebugLogger } from '@affine/debug';
import type { Job, WorkspaceService } from '@toeverything/infra';
import {
  Document,
  Entity,
  IndexedDBIndexStorage,
  IndexedDBJobQueue,
  JobRunner,
} from '@toeverything/infra';
import { difference } from 'lodash-es';
import type { Array as YArray, Map as YMap } from 'yjs';
import { applyUpdate, Doc as YDoc } from 'yjs';

import { blockIndexSchema, docIndexSchema } from '../schema';

const logger = new DebugLogger('crawler');

interface IndexerJobPayload {
  docId: string;
}

export class DocsIndexer extends Entity {
  private readonly jobQueue = new IndexedDBJobQueue<IndexerJobPayload>(
    'jq:' + this.workspaceService.workspace.id
  );

  private readonly runner = new JobRunner(
    this.jobQueue,
    (jobs, signal) => this.execJob(jobs, signal),
    () => new Promise<void>(resolve => requestIdleCallback(() => resolve()))
  );

  private readonly indexStorage = new IndexedDBIndexStorage(
    'idx:' + this.workspaceService.workspace.id
  );

  readonly docIndex = this.indexStorage.getIndex('doc', docIndexSchema);

  readonly blockIndex = this.indexStorage.getIndex('block', blockIndexSchema);

  private readonly workspaceEngine = this.workspaceService.workspace.engine;

  private readonly workspaceId = this.workspaceService.workspace.id;

  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  setupListener() {
    this.workspaceEngine.doc.storage.eventBus.on(event => {
      if (event.clientId === this.workspaceEngine.doc.clientId) {
        const docId = event.docId;

        this.jobQueue
          .enqueue([
            {
              batchKey: docId,
              payload: { docId },
            },
          ])
          .catch(err => {
            console.error('Error enqueueing job', err);
          });
      }
    });
  }

  async execJob(jobs: Job<IndexerJobPayload>[], _signal: AbortSignal) {
    if (jobs.length === 0) {
      return;
    }

    // jobs should have the same docId, so we just pick the first one
    const docId = jobs[0].payload.docId;

    logger.debug('Start crawling job for docId:', docId);

    if (docId) {
      if (docId === this.workspaceId) {
        await this.crawlingRootDocData();
      } else {
        await this.crawlingDocData(docId);
      }
    }
  }

  startCrawling() {
    this.runner.start();
    this.jobQueue
      .enqueue([
        {
          batchKey: this.workspaceId,
          payload: { docId: this.workspaceId },
        },
      ])
      .catch(err => {
        console.error('Error enqueueing job', err);
      });
  }

  async crawlingDocData(docId: string) {
    const rootDocBuffer =
      await this.workspaceEngine.doc.storage.loadDocFromLocal(this.workspaceId);

    if (!rootDocBuffer) {
      return;
    }

    const yRootDoc = new YDoc();
    applyUpdate(yRootDoc, rootDocBuffer);

    const docStoragePossibleIds = Array.from(yRootDoc.getSubdocs())
      .map(doc => doc.guid)
      .filter(id => id.endsWith(docId));

    let docBuffer;

    for (const id of docStoragePossibleIds) {
      docBuffer = await this.workspaceEngine.doc.storage.loadDocFromLocal(id);

      if (docBuffer) {
        break;
      }
    }

    if (!docBuffer) {
      return;
    }

    const ydoc = new YDoc();

    applyUpdate(ydoc, docBuffer);

    let docExists: boolean | null = null;

    (
      yRootDoc.getMap('meta').get('pages') as YArray<YMap<any>> | undefined
    )?.forEach(page => {
      if (page.get('id') === docId) {
        docExists = !(page.get('trash') ?? false);
      }
    });

    if (!docExists) {
      const indexWriter = await this.docIndex.write();
      indexWriter.delete(docId);
      await indexWriter.commit();

      const blockIndexWriter = await this.blockIndex.write();
      const oldBlocks = await blockIndexWriter.search(
        {
          type: 'match',
          field: 'docId',
          match: docId,
        },
        {
          pagination: {
            limit: Number.MAX_SAFE_INTEGER,
          },
        }
      );
      for (const block of oldBlocks.nodes) {
        blockIndexWriter.delete(block.id);
      }
      await blockIndexWriter.commit();
    } else {
      const blocks = ydoc.getMap<any>('blocks');

      if (blocks.size === 0) {
        return;
      }

      let docTitle = '';

      const blockDocuments: Document<typeof blockIndexSchema>[] = [];

      for (const block of blocks.values()) {
        const flavour = block.get('sys:flavour')?.toString();
        const blockId = block.get('sys:id')?.toString();

        if (!flavour || !blockId) {
          continue;
        }

        if (flavour === 'affine:page') {
          docTitle = block.get('prop:title').toString();
          blockDocuments.push(
            Document.from(`${docId}:${blockId}`, {
              docId,
              flavour,
              blockId,
              content: docTitle,
            })
          );
        }

        if (flavour === 'affine:paragraph') {
          blockDocuments.push(
            Document.from(`${docId}:${blockId}`, {
              docId,
              flavour,
              blockId,
              content: block.get('prop:text')?.toString(),
            })
          );
        }
      }

      const docIndexWriter = await this.docIndex.write();
      docIndexWriter.put(
        Document.from<typeof docIndexSchema>(docId, {
          title: docTitle,
        })
      );
      await docIndexWriter.commit();

      const blockIndexWriter = await this.blockIndex.write();
      const oldBlocks = await blockIndexWriter.search(
        {
          type: 'match',
          field: 'docId',
          match: docId,
        },
        {
          pagination: {
            limit: Number.MAX_SAFE_INTEGER,
          },
        }
      );
      for (const block of oldBlocks.nodes) {
        blockIndexWriter.delete(block.id);
      }
      for (const block of blockDocuments) {
        blockIndexWriter.insert(block);
      }
      await blockIndexWriter.commit();
    }
  }

  async crawlingRootDocData() {
    const buffer = await this.workspaceEngine.doc.storage.loadDocFromLocal(
      this.workspaceId
    );
    if (!buffer) {
      return;
    }

    const ydoc = new YDoc();

    applyUpdate(ydoc, buffer);

    const docs = ydoc.getMap('meta').get('pages') as
      | YArray<YMap<any>>
      | undefined;

    if (!docs) {
      return;
    }

    const availableDocs = [];

    for (const page of docs) {
      const docId = page.get('id');

      if (typeof docId !== 'string') {
        continue;
      }

      const inTrash = page.get('trash') ?? false;

      if (!inTrash) {
        availableDocs.push(docId);
      }
    }

    // a hack to get all docs in index
    const allIndexedDocs = (
      await this.docIndex.search(
        {
          type: 'all',
        },
        {
          pagination: {
            limit: Number.MAX_SAFE_INTEGER,
            skip: 0,
          },
        }
      )
    ).nodes.map(n => n.id);

    const needDelete = difference(allIndexedDocs, availableDocs);
    const needAdd = difference(availableDocs, allIndexedDocs);

    await this.jobQueue.enqueue(
      [...needAdd, ...needDelete].map(docId => ({
        batchKey: docId,
        payload: { docId },
      }))
    );
  }
}
