import { DebugLogger } from '@affine/debug';
import type { Job, JobQueue, WorkspaceService } from '@toeverything/infra';
import {
  Entity,
  IndexedDBIndexStorage,
  IndexedDBJobQueue,
  JobRunner,
  LiveData,
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

interface IndexerJobPayload {
  docId: string;
  storageDocId: string;
}

// TODO(@eyhn): simplify this, it's too complex
export class DocsIndexer extends Entity {
  private readonly jobQueue: JobQueue<IndexerJobPayload> =
    new IndexedDBJobQueue<IndexerJobPayload>(
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

  private worker: IndexerWorker | null = null;

  readonly status$ = LiveData.from<{ remaining?: number }>(
    this.jobQueue.status$.pipe(
      map(status => ({
        remaining: status.remaining,
      }))
    ),
    {}
  );

  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  setupListener() {
    this.workspaceEngine.doc.storage.eventBus.on(event => {
      if (event.docId.startsWith('db$')) {
        // skip db doc
        return;
      }
      if (event.clientId === this.workspaceEngine.doc.clientId) {
        const docId = normalizeDocId(event.docId);

        this.jobQueue
          .enqueue([
            {
              batchKey: docId,
              payload: { docId, storageDocId: event.docId },
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

    // jobs should have the same docId, so we just pick the first one
    const docId = jobs[0].payload.docId;
    const storageDocId = jobs[0].payload.storageDocId;

    const worker = await this.ensureWorker(signal);

    const startTime = performance.now();
    logger.debug('Start crawling job for docId:', docId);

    let workerOutput;

    if (docId === this.workspaceId) {
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
        docId,
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
            docIndexWriter.delete(block.id);
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
        for (const { blocks } of workerOutput.addedDoc) {
          // delete old blocks
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
          for (const block of blocks) {
            blockIndexWriter.insert(block);
          }
        }
        await blockIndexWriter.commit();
      }
    }

    if (workerOutput.reindexDoc) {
      await this.jobQueue.enqueue(
        workerOutput.reindexDoc.map(({ docId, storageDocId }) => ({
          batchKey: docId,
          payload: { docId, storageDocId },
        }))
      );
    }

    const duration = performance.now() - startTime;
    logger.debug(
      'Finish crawling job for docId:' + docId + ' in ' + duration + 'ms '
    );
  }

  startCrawling() {
    this.runner.start();
    this.jobQueue
      .enqueue([
        {
          batchKey: this.workspaceId,
          payload: { docId: this.workspaceId, storageDocId: this.workspaceId },
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

  override dispose(): void {
    this.runner.stop();
  }
}

function normalizeDocId(raw: string) {
  enum DocVariant {
    Workspace = 'workspace',
    Page = 'page',
    Space = 'space',
    Settings = 'settings',
    Unknown = 'unknown',
  }

  try {
    if (!raw.length) {
      throw new Error('Invalid Empty Doc ID');
    }

    let parts = raw.split(':');

    if (parts.length > 3) {
      // special adapt case `wsId:space:page:pageId`
      if (parts[1] === DocVariant.Space && parts[2] === DocVariant.Page) {
        parts = [parts[0], DocVariant.Space, parts[3]];
      } else {
        throw new Error(`Invalid format of Doc ID: ${raw}`);
      }
    } else if (parts.length === 2) {
      // `${variant}:${guid}`
      throw new Error('not supported');
    } else if (parts.length === 1) {
      // ${ws} or ${pageId}
      parts = ['', DocVariant.Unknown, parts[0]];
    }

    const docId = parts.at(2);

    if (!docId) {
      throw new Error('ID is required');
    }

    return docId;
  } catch (err) {
    logger.error('Error on normalize docId ' + raw, err);
    return raw;
  }
}
