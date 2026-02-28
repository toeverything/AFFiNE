import { Injectable, Logger } from '@nestjs/common';

import { Config, JOB_SIGNAL, JobQueue, OnJob } from '../../base';
import { readAllDocIdsFromWorkspaceSnapshot } from '../../core/utils/blocksuite';
import { Models } from '../../models';
import { IndexerService } from './service';

declare global {
  interface Jobs {
    'indexer.indexDoc': {
      workspaceId: string;
      docId: string;
    };
    'indexer.deleteDoc': {
      workspaceId: string;
      docId: string;
    };
    'indexer.indexWorkspace': {
      workspaceId: string;
    };
    'indexer.deleteWorkspace': {
      workspaceId: string;
    };
    'indexer.autoIndexWorkspaces': {
      lastIndexedWorkspaceSid?: number;
    };
  }
}

@Injectable()
export class IndexerJob {
  private readonly logger = new Logger(IndexerJob.name);

  constructor(
    private readonly models: Models,
    private readonly service: IndexerService,
    private readonly queue: JobQueue,
    private readonly config: Config
  ) {}

  @OnJob('indexer.indexDoc')
  async indexDoc({ workspaceId, docId }: Jobs['indexer.indexDoc']) {
    if (!this.config.indexer.enabled) {
      return;
    }

    // delete the 'indexer.deleteDoc' job from the queue
    await this.queue.remove(
      `deleteDoc/${workspaceId}/${docId}`,
      'indexer.deleteDoc'
    );
    await this.service.indexDoc(workspaceId, docId);
  }

  @OnJob('indexer.deleteDoc')
  async deleteDoc({ workspaceId, docId }: Jobs['indexer.deleteDoc']) {
    if (!this.config.indexer.enabled) {
      return;
    }

    // delete the 'indexer.updateDoc' job from the queue
    await this.queue.remove(
      `indexDoc/${workspaceId}/${docId}`,
      'indexer.indexDoc'
    );
    await this.service.deleteDoc(workspaceId, docId);
  }

  @OnJob('indexer.indexWorkspace')
  async indexWorkspace({ workspaceId }: Jobs['indexer.indexWorkspace']) {
    if (!this.config.indexer.enabled) {
      return;
    }

    await this.queue.remove(workspaceId, 'indexer.deleteWorkspace');
    const workspace = await this.models.workspace.get(workspaceId);
    if (!workspace) {
      this.logger.warn(`workspace ${workspaceId} not found`);
      return;
    }

    const snapshot = await this.models.doc.getSnapshot(
      workspaceId,
      workspaceId
    );
    if (!snapshot) {
      this.logger.warn(`workspace snapshot ${workspaceId} not found`);
      return;
    }

    const docIdsInWorkspace = readAllDocIdsFromWorkspaceSnapshot(snapshot.blob);
    const docIdsInIndexer = await this.service.listDocIds(workspaceId);

    const docIdsInWorkspaceSet = new Set(docIdsInWorkspace);
    const docIdsInIndexerSet = new Set(docIdsInIndexer);
    // diff the docIdsInWorkspace and docIdsInIndexer, if the workspace is not indexed, all the docIdsInWorkspace should be indexed
    const missingDocIds = workspace.indexed
      ? docIdsInWorkspace.filter(docId => !docIdsInIndexerSet.has(docId))
      : docIdsInWorkspace;
    const deletedDocIds = docIdsInIndexer.filter(
      docId => !docIdsInWorkspaceSet.has(docId)
    );
    for (const docId of deletedDocIds) {
      await this.queue.add(
        'indexer.deleteDoc',
        {
          workspaceId,
          docId,
        },
        {
          jobId: `deleteDoc/${workspaceId}/${docId}`,
          // the deleteDoc job should be higher priority than the indexDoc job
          priority: 0,
        }
      );
    }
    for (const docId of missingDocIds) {
      await this.queue.add(
        'indexer.indexDoc',
        {
          workspaceId,
          docId,
        },
        {
          jobId: `indexDoc/${workspaceId}/${docId}`,
          priority: 100,
        }
      );
    }
    if (!workspace.indexed) {
      await this.models.workspace.update(workspaceId, {
        indexed: true,
      });
    }
    this.logger.log(
      `indexed workspace ${workspaceId} with ${missingDocIds.length} missing docs and ${deletedDocIds.length} deleted docs`
    );
  }

  @OnJob('indexer.deleteWorkspace')
  async deleteWorkspace({ workspaceId }: Jobs['indexer.deleteWorkspace']) {
    if (!this.config.indexer.enabled) {
      return;
    }

    await this.queue.remove(
      `indexWorkspace/${workspaceId}`,
      'indexer.indexWorkspace'
    );
    await this.service.deleteWorkspace(workspaceId);
  }

  @OnJob('indexer.autoIndexWorkspaces')
  async autoIndexWorkspaces(payload: Jobs['indexer.autoIndexWorkspaces']) {
    if (!this.config.indexer.enabled) {
      return;
    }

    const startSid = payload.lastIndexedWorkspaceSid ?? 0;
    const workspaces = await this.models.workspace.list(
      { sid: { gt: startSid } },
      { id: true, indexed: true, sid: true },
      this.config.indexer.autoIndex.batchSize
    );

    if (workspaces.length === 0) {
      // Keep the current sid value when repeating
      return JOB_SIGNAL.Repeat;
    }
    let addedCount = 0;
    for (const workspace of workspaces) {
      if (workspace.indexed) {
        continue;
      }
      const snapshotMeta = await this.models.doc.getSnapshot(
        workspace.id,
        workspace.id,
        {
          select: {
            updatedAt: true,
          },
        }
      );
      // ignore 180 days not updated workspaces
      if (
        !snapshotMeta?.updatedAt ||
        Date.now() - snapshotMeta.updatedAt.getTime() >
          180 * 24 * 60 * 60 * 1000
      ) {
        continue;
      }
      await this.queue.add(
        'indexer.indexWorkspace',
        { workspaceId: workspace.id },
        { jobId: `indexWorkspace/${workspace.id}` }
      );
      addedCount++;
    }
    const nextSid = workspaces[workspaces.length - 1].sid;
    this.logger.log(
      `Auto added ${addedCount} workspaces to queue, lastIndexedWorkspaceSid: ${startSid} -> ${nextSid}`
    );

    // update the lastIndexedWorkspaceSid in the payload and repeat the job after 30 seconds
    payload.lastIndexedWorkspaceSid = nextSid;
    return JOB_SIGNAL.Repeat;
  }
}
