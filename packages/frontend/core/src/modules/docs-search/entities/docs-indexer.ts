import { DebugLogger } from '@affine/debug';
import type {
  Job,
  JobQueue,
  WorkspaceLocalState,
  WorkspaceService,
} from '@toeverything/infra';
import {
  Entity,
  IndexedDBIndexStorage,
  IndexedDBJobQueue,
  JobRunner,
  LiveData,
  WorkspaceDBService,
} from '@toeverything/infra';
import { map } from 'rxjs';

import { blockIndexSchema, docIndexSchema } from '../schema';
import { createWorker, type IndexerWorker } from '../worker/out-worker';

export function isEmptyUpdate(binary: Uint8Array) {
  return (
    binary.byteLength === 0 ||
    (binary.byteLength === 2 && binary[0] === 0 && binary[1] === 0)
  );
}

const logger = new DebugLogger('crawler');
const WORKSPACE_DOCS_INDEXER_VERSION_KEY = 'docs-indexer-version';

interface IndexerJobPayload {
  storageDocId: string;
}

export class DocsIndexer extends Entity {
  /**
   * increase this number to re-index all docs
   */
  static INDEXER_VERSION = 5;

  private readonly jobQueue: JobQueue<IndexerJobPayload> =
    new IndexedDBJobQueue<IndexerJobPayload>(
      'jq:' + this.workspaceService.workspace.id
    );

  private readonly runner = new JobRunner(
    this.jobQueue,
    (jobs, signal) => this.execJob(jobs, signal),
    () =>
      new Promise<void>(resolve =>
        requestIdleCallback(() => resolve(), {
          timeout: 200,
        })
      )
  );

  private readonly indexStorage = new IndexedDBIndexStorage(
    'idx:' + this.workspaceService.workspace.id
  );

  readonly docIndex = this.indexStorage.getIndex('doc', docIndexSchema);

  readonly blockIndex = this.indexStorage.getIndex('block', blockIndexSchema);

  private readonly workspaceEngine = this.workspaceService.workspace.engine;

  private readonly workspaceId = this.workspaceService.workspace.id;

  private worker: IndexerWorker | null = null;

  readonly status$ = LiveData.from<{ remaining?: number }>(
    this.jobQueue.status$.pipe(
      map(status => ({
        remaining: status.remaining,
      }))
    ),
    {}
  );

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceLocalState: WorkspaceLocalState
  ) {
    super();
  }

  setupListener() {
    this.workspaceEngine.doc.storage.eventBus.on(event => {
      if (WorkspaceDBService.isDBDocId(event.docId)) {
        // skip db doc
        return;
      }
      if (event.clientId === this.workspaceEngine.doc.clientId) {
        this.jobQueue
          .enqueue([
            {
              batchKey: event.docId,
              payload: { storageDocId: event.docId },
            },
          ])
          .catch(err => {
            console.error('Error enqueueing job', err);
          });
      }
    });
  }

  async execJob(jobs: Job<IndexerJobPayload>[], signal: AbortSignal) {
    if (jobs.length === 0) {
      return;
    }

    const dbVersion = this.getVersion();

    if (dbVersion > DocsIndexer.INDEXER_VERSION) {
      // stop if db version is higher then self
      this.runner.stop();
      throw new Error('Indexer is outdated');
    }

    const isUpgrade = dbVersion < DocsIndexer.INDEXER_VERSION;

    // jobs should have the same storage docId, so we just pick the first one
    const storageDocId = jobs[0].payload.storageDocId;

    const worker = await this.ensureWorker(signal);

    const startTime = performance.now();
    logger.debug('Start crawling job for storageDocId:', storageDocId);

    let workerOutput;

    if (storageDocId === this.workspaceId) {
      const rootDocBuffer =
        await this.workspaceEngine.doc.storage.loadDocFromLocal(
          this.workspaceId
        );
      if (!rootDocBuffer) {
        return;
      }

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

      workerOutput = await worker.run({
        type: 'rootDoc',
        allIndexedDocs,
        rootDocBuffer,
        reindexAll: isUpgrade,
      });
    } else {
      const rootDocBuffer =
        await this.workspaceEngine.doc.storage.loadDocFromLocal(
          this.workspaceId
        );

      const docBuffer =
        (await this.workspaceEngine.doc.storage.loadDocFromLocal(
          storageDocId
        )) ?? new Uint8Array(0);

      if (!rootDocBuffer) {
        return;
      }

      workerOutput = await worker.run({
        type: 'doc',
        docBuffer,
        storageDocId,
        rootDocBuffer,
      });
    }

    if (workerOutput.deletedDoc || workerOutput.addedDoc) {
      if (workerOutput.deletedDoc) {
        const docIndexWriter = await this.docIndex.write();
        for (const docId of workerOutput.deletedDoc) {
          docIndexWriter.delete(docId);
        }
        await docIndexWriter.commit();
        const blockIndexWriter = await this.blockIndex.write();
        for (const docId of workerOutput.deletedDoc) {
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
        }
        await blockIndexWriter.commit();
      }
      if (workerOutput.addedDoc) {
        const docIndexWriter = await this.docIndex.write();
        for (const { doc } of workerOutput.addedDoc) {
          docIndexWriter.put(doc);
        }
        await docIndexWriter.commit();
        const blockIndexWriter = await this.blockIndex.write();
        for (const { id, blocks } of workerOutput.addedDoc) {
          // delete old blocks
          const oldBlocks = await blockIndexWriter.search(
            {
              type: 'match',
              field: 'docId',
              match: id,
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
          for (const block of blocks) {
            blockIndexWriter.insert(block);
          }
        }
        await blockIndexWriter.commit();
      }
    }

    if (workerOutput.reindexDoc) {
      await this.jobQueue.enqueue(
        workerOutput.reindexDoc.map(({ storageDocId }) => ({
          batchKey: storageDocId,
          payload: { storageDocId },
        }))
      );
    }

    if (isUpgrade) {
      this.setVersion();
    }

    const duration = performance.now() - startTime;
    logger.debug(
      'Finish crawling job for storageDocId:' +
        storageDocId +
        ' in ' +
        duration +
        'ms '
    );
  }

  startCrawling() {
    this.runner.start();

    this.jobQueue
      .enqueue([
        {
          batchKey: this.workspaceId,
          payload: { storageDocId: this.workspaceId },
        },
      ])
      .catch(err => {
        console.error('Error enqueueing job', err);
      });
  }

  async ensureWorker(signal: AbortSignal): Promise<IndexerWorker> {
    if (!this.worker) {
      this.worker = await createWorker(signal);
    }
    return this.worker;
  }

  getVersion() {
    const version = this.workspaceLocalState.get<number>(
      WORKSPACE_DOCS_INDEXER_VERSION_KEY
    );
    if (typeof version !== 'number') {
      return -1;
    } else {
      return version;
    }
  }

  setVersion(version = DocsIndexer.INDEXER_VERSION) {
    if (this.getVersion() >= version) {
      return;
    }
    return this.workspaceLocalState.set(
      WORKSPACE_DOCS_INDEXER_VERSION_KEY,
      version
    );
  }

  override dispose(): void {
    this.runner.stop();
  }
}
