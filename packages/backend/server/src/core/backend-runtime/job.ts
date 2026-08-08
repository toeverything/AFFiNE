import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { JobQueue, OnEvent, OnJob } from '../../base';
import { Models } from '../../models';
import { projectDocSearch } from '../utils/blocksuite';
import { BackendRuntimeProvider } from './provider';

declare global {
  interface Jobs {
    'nightly.cleanExpiredBackendRuntimeHousekeeping': {};
    'backendRuntime.syncDocumentEmbedding': {
      workspaceId: string;
      docId: string;
    };
    'backendRuntime.reconcileDocumentEmbeddings': {
      workspaceId: string;
    };
  }
}

@Injectable()
export class BackendRuntimeEmbeddingJob {
  constructor(
    private readonly rt: BackendRuntimeProvider,
    private readonly queue: JobQueue,
    private readonly models: Models
  ) {}

  @OnEvent('doc.updated')
  async onDocUpdated({ workspaceId, docId }: Events['doc.updated']) {
    await this.queueDocument(workspaceId, docId);
  }

  @OnEvent('doc.snapshot.updated')
  async onDocSnapshotUpdated({
    workspaceId,
    docId,
  }: Events['doc.snapshot.updated']) {
    if (workspaceId === docId) {
      await this.queue.add(
        'backendRuntime.reconcileDocumentEmbeddings',
        { workspaceId },
        { jobId: `reconcileDocumentEmbeddings/${workspaceId}` }
      );
      return;
    }
    await this.queueDocument(workspaceId, docId);
  }

  private async queueDocument(workspaceId: string, docId: string) {
    if (
      workspaceId === docId ||
      docId.startsWith('db$') ||
      docId.startsWith('userdata$')
    ) {
      return;
    }
    await this.queue.add(
      'backendRuntime.syncDocumentEmbedding',
      { workspaceId, docId },
      { jobId: `syncDocumentEmbedding/${workspaceId}/${docId}` }
    );
  }

  @OnJob('backendRuntime.syncDocumentEmbedding')
  async syncDocument({
    workspaceId,
    docId,
  }: Jobs['backendRuntime.syncDocumentEmbedding']) {
    if (!(await this.rt.embeddingHealth()).enabled) return;

    const snapshot = await this.models.doc.getSnapshot(workspaceId, docId);
    if (!snapshot || snapshot.blob.length <= 2) return;

    const revision = snapshot.updatedAt.getTime().toString();
    const projection = projectDocSearch(snapshot.blob, docId, revision);
    await this.rt.syncEmbeddingState({
      workspaceId,
      enabled: await this.models.workspace.allowEmbedding(workspaceId),
      reconcileDocuments: true,
      documents: [
        {
          docId,
          revision,
          sourceHash: projection.sourceHash,
          units: projection.units.map(unit => ({
            unitId: unit.unitId,
            visibility: unit.visibility,
            text: unit.text,
            blockId: unit.blockId,
            elementId: unit.elementId,
            frameId: unit.frameId,
          })),
        },
      ],
    });
  }

  @OnJob('backendRuntime.reconcileDocumentEmbeddings')
  async reconcileDocuments({
    workspaceId,
  }: Jobs['backendRuntime.reconcileDocumentEmbeddings']) {
    if (!(await this.rt.embeddingHealth()).enabled) return;
    await this.rt.syncEmbeddingState({
      workspaceId,
      enabled: await this.models.workspace.allowEmbedding(workspaceId),
      reconcileDocuments: true,
    });
  }
}

@Injectable()
export class BackendRuntimeHousekeepingJob {
  private readonly logger = new Logger(BackendRuntimeHousekeepingJob.name);

  constructor(
    private readonly rt: BackendRuntimeProvider,
    private readonly queue: JobQueue
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async nightlyJob() {
    await this.queue.add(
      'nightly.cleanExpiredBackendRuntimeHousekeeping',
      {},
      {
        jobId: 'nightly-backend-runtime-housekeeping',
      }
    );
  }

  @OnJob('nightly.cleanExpiredBackendRuntimeHousekeeping')
  async cleanExpiredRuntimeHousekeeping() {
    const states = await this.cleanBatches(() =>
      this.rt.cleanupExpiredRuntimeStates(1000)
    );
    const gates = await this.cleanBatches(() =>
      this.rt.cleanupExpiredRuntimeGates(1000)
    );
    const rollingQuota = await this.cleanBatches(() =>
      this.rt.cleanupExpiredRollingQuota(1000)
    );
    const artifacts = await this.cleanBatches(() =>
      this.rt.cleanupUnreferencedArtifacts(1000)
    );
    const embeddingWorkspaces = await this.rt.reconcileEmbeddingWorkspaces();

    this.logger.log(
      `cleaned runtime housekeeping states=${states} gates=${gates} rollingQuota=${rollingQuota} artifacts=${artifacts} embeddingWorkspaces=${embeddingWorkspaces}`
    );
  }

  private async cleanBatches(fn: () => Promise<number>) {
    let total = 0;
    for (;;) {
      const count = Number(await fn());
      total += count;
      if (count < 1000) {
        break;
      }
    }
    return total;
  }
}
