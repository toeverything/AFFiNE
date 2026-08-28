import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import {
  ConfigFactory,
  CopilotSelectedSourcesFailed,
  CopilotSelectedSourcesLimitExceeded,
  CopilotSelectedSourcesProcessing,
  CopilotSelectedSourcesUnavailable,
  JobQueue,
  metrics,
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
    'backendRuntime.cleanExpiredHousekeeping': {};
    'backendRuntime.syncDocumentEmbedding': {
      workspaceId: string;
      docId: string;
    };
    'backendRuntime.reconcileDocumentEmbeddings': {
      workspaceId: string;
    };
    'backendRuntime.reconcileSearchProjection': {
      limit?: number;
    };
  }
}

@Injectable()
export class BackendRuntimeEmbeddingService {
  constructor(
    private readonly rt: BackendRuntimeProvider,
    private readonly models: Models
  ) {}

  async syncDocument(workspaceId: string, docId: string) {
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

  async reconcileDocuments(workspaceId: string) {
    if (!(await this.rt.embeddingHealth()).enabled) return;
    await this.rt.syncEmbeddingState({
      workspaceId,
      enabled: await this.models.workspace.allowEmbedding(workspaceId),
      reconcileDocuments: true,
    });
  }
}

@Injectable()
export class BackendRuntimeEmbeddingProducer {
  constructor(private readonly queue: JobQueue) {}

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
}

@Injectable()
export class BackendRuntimeEmbeddingJob {
  constructor(private readonly service: BackendRuntimeEmbeddingService) {}

  @OnJob('backendRuntime.syncDocumentEmbedding')
  async syncDocument({
    workspaceId,
    docId,
  }: Jobs['backendRuntime.syncDocumentEmbedding']) {
    await this.service.syncDocument(workspaceId, docId);
  }

  @OnJob('backendRuntime.reconcileDocumentEmbeddings')
  async reconcileDocuments({
    workspaceId,
  }: Jobs['backendRuntime.reconcileDocumentEmbeddings']) {
    await this.service.reconcileDocuments(workspaceId);
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
      'backendRuntime.cleanExpiredHousekeeping',
      {},
      {
        jobId: 'nightly-backend-runtime-housekeeping',
      }
    );
  }

  @OnJob('backendRuntime.cleanExpiredHousekeeping')
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

@Injectable()
export class BackendRuntimeSearchJob {
  constructor(
    private readonly rt: BackendRuntimeProvider,
    private readonly queue: JobQueue,
    private readonly config: ConfigFactory
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async scheduleReconciliation() {
    if (!this.config.config.indexer.enabled) return;
    await this.queue.add(
      'backendRuntime.reconcileSearchProjection',
      { limit: 100 },
      {
        jobId: 'backend-runtime-search-reconciliation',
        attempts: 1,
        removeOnFail: true,
      }
    );
  }

  @OnJob('backendRuntime.reconcileSearchProjection')
  async reconcileProjection({
    limit = 100,
  }: Jobs['backendRuntime.reconcileSearchProjection']) {
    if (!this.config.config.indexer.enabled) return 0;
    const startedAt = performance.now();
    try {
      const reconciled = await this.rt.reconcileSearchProjection(limit);
      const status = (await this.rt.searchStatus()) as {
        ready?: boolean;
        state?: string;
        metrics?: {
          scanCursor?: number;
          scanHighWater?: number;
          pendingPublications?: number;
          gcBacklog?: number;
          providerRequests?: number;
          providerLatencyMicrosAvg?: number;
          generationGcFailures?: number;
          filterDrops?: {
            missingPublished?: number;
            projectionMismatch?: number;
            canonicalPermission?: number;
          };
        };
      };
      metrics.search.counter('reconcile_runs').add(1);
      metrics.search.gauge('reconciled_workspaces').record(reconciled);
      metrics.search.gauge('generation_ready').record(status.ready ? 1 : 0, {
        state: status.state ?? 'unknown',
      });
      metrics.search
        .histogram('reconcile_latency_ms')
        .record(performance.now() - startedAt);
      const projection = status.metrics;
      if (projection) {
        metrics.search.gauge('scan_cursor').record(projection.scanCursor ?? 0);
        metrics.search
          .gauge('scan_high_water')
          .record(projection.scanHighWater ?? 0);
        metrics.search
          .gauge('pending_publications')
          .record(projection.pendingPublications ?? 0);
        metrics.search.gauge('gc_backlog').record(projection.gcBacklog ?? 0);
        metrics.search
          .gauge('provider_requests')
          .record(projection.providerRequests ?? 0);
        metrics.search
          .gauge('provider_latency_micros_avg')
          .record(projection.providerLatencyMicrosAvg ?? 0);
        metrics.search
          .gauge('generation_gc_failures')
          .record(projection.generationGcFailures ?? 0);
        metrics.search
          .gauge('filter_drops')
          .record(projection.filterDrops?.missingPublished ?? 0, {
            reason: 'missing_published',
          });
        metrics.search
          .gauge('filter_drops')
          .record(projection.filterDrops?.projectionMismatch ?? 0, {
            reason: 'projection_mismatch',
          });
        metrics.search
          .gauge('filter_drops')
          .record(projection.filterDrops?.canonicalPermission ?? 0, {
            reason: 'canonical_permission',
          });
      }
      return reconciled;
    } catch (error) {
      metrics.search.counter('reconcile_failures').add(1);
      throw error;
    }
  }
}
