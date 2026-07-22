import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import { EventBus, JobQueue, metrics, OnJob } from '../../base';
import { StorageRuntimeProvider } from '../storage-runtime';

// Queue keys are persisted API; keep the legacy backendRuntime.* names while
// StorageBlobJob and StorageRuntimeProvider own the implementation.
declare global {
  interface Jobs {
    'backendRuntime.backfillMissingBlobMetadata': {
      workspaceId: string;
      limit?: number;
    };
    'backendRuntime.backfillMissingBlobMetadataBySid': {
      lastSid?: number;
      workspaceLimit?: number;
      objectLimit?: number;
    };
    'backendRuntime.reconcileWorkspaceStorageBySid': {
      lastSid?: number;
      workspaceLimit?: number;
      docLimit?: number;
    };
    'backendRuntime.executeDocumentCleanupCandidates': {
      workspaceId?: string;
      gracePeriodDays?: number;
      limit?: number;
    };
    'backendRuntime.ackDocumentCleanupEffect': {
      workspaceId: string;
      docId: string;
      cleanupVersion: string;
      effect: 'search' | 'copilot';
    };
    'backendRuntime.planUnreferencedWorkspaceBlobs': {
      workspaceId: string;
      gracePeriodDays?: number;
      limit?: number;
    };
    'backendRuntime.planUnreferencedWorkspaceBlobsBySid': {
      lastSid?: number;
      workspaceLimit?: number;
      gracePeriodDays?: number;
      limit?: number;
    };
    'backendRuntime.executeBlobCleanupCandidates': {
      runId: string;
      gracePeriodDays?: number;
      limit?: number;
    };
    'backendRuntime.executeBlobCleanupCandidatesByMarkedRuns': {
      runLimit?: number;
      gracePeriodDays?: number;
      candidateLimit?: number;
    };
  }
}

@Injectable()
export class StorageBlobJob {
  private readonly logger = new Logger(StorageBlobJob.name);

  constructor(
    private readonly rt: StorageRuntimeProvider,
    private readonly event: EventBus,
    private readonly queue: JobQueue,
    private readonly db: PrismaClient
  ) {}

  private autoLog(message: string, shouldDetail: boolean) {
    if (shouldDetail) {
      this.logger.log(message);
    } else {
      this.logger.verbose(message);
    }
  }

  async enqueueBackfillMissingBlobMetadata(workspaceId: string, limit = 1000) {
    await this.queue.add('backendRuntime.backfillMissingBlobMetadata', {
      workspaceId,
      limit,
    });
  }

  async enqueueBackfillMissingBlobMetadataBySid(
    lastSid = 0,
    workspaceLimit = 100,
    objectLimit = 1000
  ) {
    await this.queue.add('backendRuntime.backfillMissingBlobMetadataBySid', {
      lastSid,
      workspaceLimit,
      objectLimit,
    });
  }

  @OnJob('backendRuntime.backfillMissingBlobMetadataBySid')
  async backfillMissingBlobMetadataBySid({
    lastSid = 0,
    workspaceLimit = 100,
    objectLimit = 1000,
  }: Jobs['backendRuntime.backfillMissingBlobMetadataBySid']) {
    if (!(await this.hasObjectStorage('blob metadata backfill sweep'))) {
      return;
    }

    const workspaces = await this.db.workspace.findMany({
      where: { sid: { gt: lastSid } },
      orderBy: { sid: 'asc' },
      select: { id: true, sid: true },
      take: workspaceLimit,
    });

    for (const workspace of workspaces) {
      try {
        await this.drainBlobMetadataBackfill(workspace.id, objectLimit, {
          sid: workspace.sid,
        });
      } catch (err) {
        this.logger.error(
          `blob metadata backfill failed workspace=${workspace.id} sid=${workspace.sid}`,
          err
        );
      }
    }

    const nextSid = workspaces.at(-1)?.sid;
    if (nextSid !== undefined && workspaces.length === workspaceLimit) {
      await this.enqueueBackfillMissingBlobMetadataBySid(
        nextSid,
        workspaceLimit,
        objectLimit
      );
    }
  }

  async enqueuePlanUnreferencedWorkspaceBlobs(
    workspaceId: string,
    gracePeriodDays = 30,
    limit = 1000
  ) {
    await this.queue.add('backendRuntime.planUnreferencedWorkspaceBlobs', {
      workspaceId,
      gracePeriodDays,
      limit,
    });
  }

  async enqueuePlanUnreferencedWorkspaceBlobsBySid(
    lastSid = 0,
    workspaceLimit = 100,
    gracePeriodDays = 30,
    limit = 1000
  ) {
    await this.queue.add('backendRuntime.planUnreferencedWorkspaceBlobsBySid', {
      lastSid,
      workspaceLimit,
      gracePeriodDays,
      limit,
    });
  }

  async enqueueExecuteBlobCleanupCandidates(
    runId: string,
    gracePeriodDays = 30,
    limit = 1000
  ) {
    await this.queue.add('backendRuntime.executeBlobCleanupCandidates', {
      runId,
      gracePeriodDays,
      limit,
    });
  }

  async enqueueExecuteBlobCleanupCandidatesByMarkedRuns(
    runLimit = 10,
    gracePeriodDays = 30,
    candidateLimit = 1000
  ) {
    await this.queue.add(
      'backendRuntime.executeBlobCleanupCandidatesByMarkedRuns',
      {
        runLimit,
        gracePeriodDays,
        candidateLimit,
      }
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async dailyBlobMetadataBackfill() {
    await this.queue.add(
      'backendRuntime.backfillMissingBlobMetadataBySid',
      {},
      { jobId: 'daily-backend-runtime-blob-metadata-backfill' }
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async dailyStorageReconciliation() {
    await this.queue.add(
      'backendRuntime.reconcileWorkspaceStorageBySid',
      {},
      { jobId: 'daily-backend-runtime-storage-reconciliation' }
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async dailyBlobCleanupExecution() {
    await this.queue.add(
      'backendRuntime.executeDocumentCleanupCandidates',
      {},
      { jobId: 'daily-backend-runtime-document-cleanup-execution' }
    );
    await this.queue.add(
      'backendRuntime.executeBlobCleanupCandidatesByMarkedRuns',
      {},
      { jobId: 'daily-backend-runtime-blob-cleanup-execution' }
    );
  }

  @OnJob('backendRuntime.backfillMissingBlobMetadata')
  async backfillMissingBlobMetadata({
    workspaceId,
    limit = 1000,
  }: Jobs['backendRuntime.backfillMissingBlobMetadata']) {
    if (!(await this.hasObjectStorage('blob metadata backfill'))) {
      return;
    }

    await this.drainBlobMetadataBackfill(workspaceId, limit);
  }

  @OnJob('backendRuntime.reconcileWorkspaceStorageBySid')
  async reconcileWorkspaceStorageBySid({
    lastSid = 0,
    workspaceLimit = 100,
    docLimit = 1000,
  }: Jobs['backendRuntime.reconcileWorkspaceStorageBySid']) {
    const workspaces = await this.db.workspace.findMany({
      where: { sid: { gt: lastSid } },
      orderBy: { sid: 'asc' },
      select: { id: true, sid: true },
      take: workspaceLimit,
    });
    const objectStorageConfigured = await this.hasObjectStorage(
      'storage reconciliation blob cleanup planning'
    );

    for (const workspace of workspaces) {
      try {
        await this.rt.reconcileWorkspaceDocuments(workspace.id);
        await this.drainWorkspaceDocBlobRefs(workspace.id, docLimit, {
          sid: workspace.sid,
        });
        if (objectStorageConfigured) {
          await this.drainBlobCleanupPlanning(workspace.id, 30, 1000, {
            sid: workspace.sid,
          });
        }
      } catch (err) {
        metrics.storage
          .counter('document_cleanup_workspace_failure_total')
          .add(1);
        this.logger.error(
          `storage reconciliation failed workspace=${workspace.id} sid=${workspace.sid}`,
          err
        );
      }
    }

    const nextSid = workspaces.at(-1)?.sid;
    if (nextSid !== undefined && workspaces.length === workspaceLimit) {
      await this.queue.add('backendRuntime.reconcileWorkspaceStorageBySid', {
        lastSid: nextSid,
        workspaceLimit,
        docLimit,
      });
    }
  }

  @OnJob('backendRuntime.executeDocumentCleanupCandidates')
  async executeDocumentCleanupCandidates({
    workspaceId,
    gracePeriodDays = 30,
    limit = 100,
  }: Jobs['backendRuntime.executeDocumentCleanupCandidates']) {
    const result = await this.rt.executeDocumentCleanupCandidates(
      workspaceId,
      gracePeriodDays,
      limit
    );
    metrics.storage
      .counter('document_cleanup_serialization_retry_total')
      .add(result.serializationRetries);
    metrics.storage
      .counter('document_cleanup_execute_failure_total')
      .add(result.failed);
    for (const effect of result.effects) {
      if (!effect.searchDone) {
        await this.queue.add('indexer.reconcileDocumentCleanup', effect, {
          jobId: `document-cleanup:search:${effect.workspaceId}:${effect.docId}:${effect.cleanupVersion}`,
        });
      }
      if (!effect.copilotDone) {
        await this.queue.add(
          'copilot.embedding.reconcileDocumentCleanup',
          effect,
          {
            jobId: `document-cleanup:copilot:${effect.workspaceId}:${effect.docId}:${effect.cleanupVersion}`,
          }
        );
      }
      if (effect.commentObjectsDone) {
        await this.event.emitAsync('workspace.blobs.updated', {
          workspaceId: effect.workspaceId,
        });
      }
    }
    await this.recordDocumentCleanupHealth();
    return result;
  }

  @OnJob('backendRuntime.ackDocumentCleanupEffect')
  async ackDocumentCleanupEffect({
    workspaceId,
    docId,
    cleanupVersion,
    effect,
  }: Jobs['backendRuntime.ackDocumentCleanupEffect']) {
    await this.rt.ackDocumentCleanupEffect(
      workspaceId,
      docId,
      cleanupVersion,
      effect
    );
  }

  @OnJob('backendRuntime.planUnreferencedWorkspaceBlobs')
  async planUnreferencedWorkspaceBlobs({
    workspaceId,
    gracePeriodDays = 30,
    limit = 1000,
  }: Jobs['backendRuntime.planUnreferencedWorkspaceBlobs']) {
    if (!(await this.hasObjectStorage('blob cleanup planning'))) {
      return;
    }

    await this.drainBlobCleanupPlanning(workspaceId, gracePeriodDays, limit);
  }

  @OnJob('backendRuntime.planUnreferencedWorkspaceBlobsBySid')
  async planUnreferencedWorkspaceBlobsBySid({
    lastSid = 0,
    workspaceLimit = 100,
    gracePeriodDays = 30,
    limit = 1000,
  }: Jobs['backendRuntime.planUnreferencedWorkspaceBlobsBySid']) {
    if (!(await this.hasObjectStorage('blob cleanup planning sweep'))) {
      return;
    }

    const workspaces = await this.db.workspace.findMany({
      where: {
        sid: {
          gt: lastSid,
        },
      },
      orderBy: {
        sid: 'asc',
      },
      select: {
        id: true,
        sid: true,
      },
      take: workspaceLimit,
    });

    for (const workspace of workspaces) {
      try {
        await this.drainBlobCleanupPlanning(
          workspace.id,
          gracePeriodDays,
          limit,
          { sid: workspace.sid }
        );
      } catch (err) {
        this.logger.error(
          `blob cleanup planning failed workspace=${workspace.id} sid=${workspace.sid}`,
          err
        );
      }
    }

    const nextSid = workspaces.at(-1)?.sid;
    if (nextSid !== undefined && workspaces.length === workspaceLimit) {
      await this.enqueuePlanUnreferencedWorkspaceBlobsBySid(
        nextSid,
        workspaceLimit,
        gracePeriodDays,
        limit
      );
    }
  }

  @OnJob('backendRuntime.executeBlobCleanupCandidates')
  async executeBlobCleanupCandidates({
    runId,
    gracePeriodDays = 30,
    limit = 1000,
  }: Jobs['backendRuntime.executeBlobCleanupCandidates']) {
    if (!(await this.hasObjectStorage('blob cleanup execution'))) {
      return;
    }

    const result = await this.rt.executeBlobCleanupCandidates(
      runId,
      gracePeriodDays,
      limit
    );
    await Promise.all(
      result.workspaceIds.map((workspaceId: string) =>
        this.event.emitAsync('workspace.blobs.updated', { workspaceId })
      )
    );
    this.autoLog(
      `executed blob cleanup run=${runId} deleted=${result.deletedObjects} skipped=${result.skippedStillReferenced} failed=${result.failed}`,
      Boolean(result.failed)
    );
  }

  @OnJob('backendRuntime.executeBlobCleanupCandidatesByMarkedRuns')
  async executeBlobCleanupCandidatesByMarkedRuns({
    runLimit = 10,
    gracePeriodDays = 30,
    candidateLimit = 1000,
  }: Jobs['backendRuntime.executeBlobCleanupCandidatesByMarkedRuns']) {
    if (!(await this.hasObjectStorage('blob cleanup execution sweep'))) {
      return;
    }

    const normalizedRunLimit = Math.max(1, runLimit);
    const normalizedCandidateLimit = Math.max(1, candidateLimit);
    const runIds = await this.loadPendingBlobCleanupRunIds(normalizedRunLimit);
    let hadDrainError = false;
    for (const runId of runIds) {
      try {
        await this.drainBlobCleanupExecution(
          runId,
          gracePeriodDays,
          normalizedCandidateLimit
        );
      } catch (err) {
        hadDrainError = true;
        this.logger.error(`blob cleanup execution failed run=${runId}`, err);
      }
    }

    if (
      !hadDrainError &&
      runIds.length === normalizedRunLimit &&
      (await this.hasMarkedBlobCleanupCandidates())
    ) {
      await this.enqueueExecuteBlobCleanupCandidatesByMarkedRuns(
        normalizedRunLimit,
        gracePeriodDays,
        normalizedCandidateLimit
      );
    }
  }

  private async drainBlobMetadataBackfill(
    workspaceId: string,
    limit: number,
    context: { sid?: number } = {}
  ) {
    for (;;) {
      const result = await this.rt.backfillMissingBlobMetadata(
        workspaceId,
        limit
      );
      await Promise.all(
        result.workspaceIds.map((workspaceId: string) =>
          this.event.emitAsync('workspace.blobs.updated', { workspaceId })
        )
      );
      this.autoLog(
        `backfilled blob metadata workspace=${workspaceId}${context.sid === undefined ? '' : ` sid=${context.sid}`} upserted=${result.upsertedMetadata} scanned=${result.scannedObjects}`,
        Boolean(result.upsertedMetadata)
      );
      if (!result.nextCursor) {
        break;
      }
    }
  }

  private async drainWorkspaceDocBlobRefs(
    workspaceId: string,
    limit: number,
    context: { sid?: number } = {}
  ) {
    for (;;) {
      const result = await this.rt.rebuildWorkspaceDocBlobRefs(
        workspaceId,
        limit
      );
      this.autoLog(
        `rebuilt doc blob refs workspace=${workspaceId}${context.sid === undefined ? '' : ` sid=${context.sid}`} parsed=${result.parsedDocs} failed=${result.failedDocs}`,
        Boolean(result.failedDocs)
      );
      if (!result.nextCursor) {
        break;
      }
    }
  }

  private async drainBlobCleanupPlanning(
    workspaceId: string,
    gracePeriodDays: number,
    limit: number,
    context: { sid?: number } = {}
  ) {
    for (;;) {
      const result = await this.rt.planUnreferencedWorkspaceBlobs(
        workspaceId,
        gracePeriodDays,
        limit
      );
      this.autoLog(
        `planned blob cleanup workspace=${workspaceId}${context.sid === undefined ? '' : ` sid=${context.sid}`} run=${result.runId} candidates=${result.candidatesMarked} scanned=${result.scannedBlobs}`,
        Boolean(result.candidatesMarked)
      );
      if (!result.nextCursor) {
        break;
      }
    }
  }

  private async drainBlobCleanupExecution(
    runId: string,
    gracePeriodDays: number,
    limit: number
  ) {
    for (;;) {
      const result = await this.rt.executeBlobCleanupCandidates(
        runId,
        gracePeriodDays,
        limit
      );
      await Promise.all(
        result.workspaceIds.map((workspaceId: string) =>
          this.event.emitAsync('workspace.blobs.updated', { workspaceId })
        )
      );
      this.autoLog(
        `executed blob cleanup run=${runId} deleted=${result.deletedObjects} skipped=${result.skippedStillReferenced} failed=${result.failed}`,
        Boolean(result.failed)
      );

      const progressed =
        result.deletedMetadata > 0 || result.skippedStillReferenced > 0;
      if (result.scannedCandidates < limit || !progressed) {
        break;
      }
    }
  }

  private async loadPendingBlobCleanupRunIds(limit: number) {
    const rows = await this.db.$queryRaw<{ runId: string }[]>`
      SELECT run_id::text AS "runId"
      FROM blob_cleanup_candidates
      WHERE status IN ('marked', 'failed')
      GROUP BY run_id
      ORDER BY
        CASE WHEN BOOL_OR(status = 'marked') THEN 0 ELSE 1 END ASC,
        MIN(planned_at) ASC
      LIMIT ${limit}
    `;
    return rows.map(row => row.runId);
  }

  private async recordDocumentCleanupHealth() {
    const [health] = await this.db.$queryRaw<
      {
        marked: bigint;
        failed: bigint;
        effectsPending: bigint;
        failedWorkspaceCheckpoints: bigint;
        rootFailureCheckpoints: bigint;
        staleProjectionBlocks: bigint;
        oldestFailedSeconds: number | null;
        oldestEffectsPendingSeconds: number | null;
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE status = 'marked') AS marked,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE status = 'effects_pending') AS "effectsPending",
        EXTRACT(EPOCH FROM CURRENT_TIMESTAMP -
          MIN(updated_at) FILTER (WHERE status = 'failed'))::double precision AS "oldestFailedSeconds",
        EXTRACT(EPOCH FROM CURRENT_TIMESTAMP -
          MIN(updated_at) FILTER (WHERE status = 'effects_pending'))::double precision AS "oldestEffectsPendingSeconds",
        (SELECT COUNT(*) FROM storage_reconciliation_checkpoints
          WHERE kind = 'document_cleanup' AND status = 'failed') AS "failedWorkspaceCheckpoints",
        (SELECT COUNT(*) FROM storage_reconciliation_checkpoints
          WHERE kind = 'document_cleanup' AND status = 'failed'
            AND metadata->>'failureKind' = 'root') AS "rootFailureCheckpoints",
        (SELECT COUNT(*) FROM storage_reconciliation_runs
          WHERE kind = 'blob_cleanup_plan'
            AND started_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'
            AND jsonb_array_length(COALESCE(metadata->'staleOrFailedProjectionWorkspaces', '[]')) > 0
        ) AS "staleProjectionBlocks"
      FROM document_cleanup_candidates
    `;
    if (!health) {
      return;
    }
    for (const [name, value] of [
      ['document_cleanup_marked', health.marked],
      ['document_cleanup_failed', health.failed],
      ['document_cleanup_effects_pending', health.effectsPending],
      [
        'document_cleanup_failed_workspace_checkpoints',
        health.failedWorkspaceCheckpoints,
      ],
      [
        'document_cleanup_root_failure_checkpoints',
        health.rootFailureCheckpoints,
      ],
      [
        'document_cleanup_stale_projection_blocks',
        health.staleProjectionBlocks,
      ],
    ] as const) {
      metrics.storage.gauge(name).record(Number(value));
    }
    metrics.storage
      .gauge('document_cleanup_oldest_failed_seconds')
      .record(health.oldestFailedSeconds ?? 0);
    metrics.storage
      .gauge('document_cleanup_oldest_effects_pending_seconds')
      .record(health.oldestEffectsPendingSeconds ?? 0);

    if (
      health.failedWorkspaceCheckpoints > 0n ||
      health.rootFailureCheckpoints > 0n ||
      health.staleProjectionBlocks > 0n ||
      (health.oldestFailedSeconds ?? 0) >= 86_400 ||
      (health.oldestEffectsPendingSeconds ?? 0) >= 86_400 ||
      health.marked >= 10_000n
    ) {
      this.logger.warn(
        `document cleanup health marked=${health.marked} failed=${health.failed} effectsPending=${health.effectsPending} failedWorkspaceCheckpoints=${health.failedWorkspaceCheckpoints} rootFailureCheckpoints=${health.rootFailureCheckpoints} staleProjectionBlocks=${health.staleProjectionBlocks} oldestFailedSeconds=${health.oldestFailedSeconds ?? 0} oldestEffectsPendingSeconds=${health.oldestEffectsPendingSeconds ?? 0}`
      );
    }
  }

  private async hasMarkedBlobCleanupCandidates() {
    const rows = await this.db.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1
        FROM blob_cleanup_candidates
        WHERE status = 'marked'
      ) AS "exists"
    `;
    return rows[0]?.exists ?? false;
  }

  private async hasObjectStorage(operation: string) {
    const health = await this.rt.health();
    if (health.provider) {
      return true;
    }

    this.logger.warn(
      `skip ${operation}: StorageRuntime provider is not configured`
    );
    return false;
  }
}
