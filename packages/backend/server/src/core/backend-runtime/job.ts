import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import {
  CopilotSelectedSourcesFailed,
  CopilotSelectedSourcesLimitExceeded,
  CopilotSelectedSourcesProcessing,
  CopilotSelectedSourcesUnavailable,
  JobQueue,
  OnEvent,
  OnJob,
} from '../../base';
import { Models } from '../../models';
import { projectDocSearch } from '../utils/blocksuite';
import { BackendRuntimeProvider } from './provider';

const SELECTED_DOCUMENT_LIMIT = 64;
const SELECTED_DOCUMENT_UNIT_LIMIT = 20_000;
const SELECTED_DOCUMENT_TEXT_BYTE_LIMIT = 16 * 1024 * 1024;
const SELECTED_DOCUMENT_PRIORITY = 1000;
const SELECTED_DOCUMENT_WAIT_MS = 90_000;

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
    await this.syncDocuments(workspaceId, [docId], true);
  }

  async prepareSelectedDocuments(workspaceId: string, docIds: string[]) {
    const selectedDocIds = [...new Set(docIds)];
    if (selectedDocIds.length > SELECTED_DOCUMENT_LIMIT) {
      throw new CopilotSelectedSourcesLimitExceeded();
    }
    try {
      await this.syncDocuments(workspaceId, selectedDocIds, false, {
        priority: SELECTED_DOCUMENT_PRIORITY,
        waitForReadyMs: SELECTED_DOCUMENT_WAIT_MS,
      });
    } catch (error) {
      throw this.mapSelectedSourceError(error);
    }
  }

  private mapSelectedSourceError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('embedding_selected_sources_processing')) {
      return new CopilotSelectedSourcesProcessing();
    }
    if (message.includes('embedding_selected_sources_failed')) {
      return new CopilotSelectedSourcesFailed();
    }
    if (message.includes('embedding_selected_sources_unavailable')) {
      return new CopilotSelectedSourcesUnavailable();
    }
    return error;
  }

  private async syncDocuments(
    workspaceId: string,
    docIds: string[],
    reconcileDocuments: boolean,
    scheduling?: { priority: number; waitForReadyMs: number }
  ) {
    if (!(await this.rt.embeddingHealth()).enabled) {
      if (scheduling) throw new CopilotSelectedSourcesUnavailable();
      return;
    }
    const enabled = await this.models.workspace.allowEmbedding(workspaceId);
    if (!enabled) {
      if (scheduling) throw new CopilotSelectedSourcesUnavailable();
      return;
    }
    const documents = [];
    let unitCount = 0;
    let textBytes = 0;
    for (const docId of docIds) {
      const snapshot = await this.models.doc.getSnapshot(workspaceId, docId);
      if (!snapshot) {
        if (scheduling) throw new CopilotSelectedSourcesUnavailable();
        continue;
      }
      const revision = snapshot.updatedAt.getTime().toString();
      const projection = projectDocSearch(snapshot.blob, docId, revision);
      unitCount += projection.units.length;
      for (const unit of projection.units) {
        textBytes += Buffer.byteLength(unit.text);
      }
      if (
        unitCount > SELECTED_DOCUMENT_UNIT_LIMIT ||
        textBytes > SELECTED_DOCUMENT_TEXT_BYTE_LIMIT
      ) {
        throw new CopilotSelectedSourcesLimitExceeded();
      }
      documents.push({
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
      });
    }
    if (!documents.length && !reconcileDocuments) return;
    await this.rt.syncEmbeddingState({
      workspaceId,
      enabled,
      reconcileDocuments,
      documents,
      ...scheduling,
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
