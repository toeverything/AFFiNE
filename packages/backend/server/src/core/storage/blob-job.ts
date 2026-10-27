import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import { EventBus, metrics } from '../../base';
import { StorageRuntimeProvider } from '../storage-runtime';

const WORKSPACE_BATCH_SIZE = 25;
const OBJECT_BATCH_SIZE = 1_000;
const DOCUMENT_CLEANUP_BATCH_SIZE = 100;
const RECONCILIATION_LEASE_MS = 30 * 60 * 1000;

type SweepScope = 'metadata' | 'documents';

declare global {
  interface Events {
    'workspace.blobs.updated': { workspaceId: string };
  }
}

@Injectable()
export class StorageBlobJob {
  private readonly logger = new Logger(StorageBlobJob.name);

  constructor(
    private readonly rt: StorageRuntimeProvider,
    private readonly event: EventBus,
    private readonly db: PrismaClient
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { waitForCompletion: true })
  async reconcileStorage() {
    const claimId = randomUUID();
    if (!(await this.claimReconciliationLease(claimId))) return;
    try {
      await Promise.allSettled([
        this.reconcileWorkspaceNamespaces(),
        this.reconcileWorkspaceBatch(),
        this.backfillBlobMetadata(),
        this.executeDocumentCleanup(),
      ]).then(results => {
        for (const result of results) {
          if (result.status === 'rejected') {
            this.logger.error(
              'storage reconciliation shard failed',
              result.reason
            );
          }
        }
      });
    } finally {
      await this.releaseReconciliationLease(claimId);
    }
  }

  async backfillBlobMetadata() {
    if (!(await this.hasObjectStorage('blob metadata backfill'))) {
      return;
    }
    await this.runWorkspaceSweep('metadata', async (workspaceId, sid) => {
      const result = await this.rt.backfillMissingBlobMetadata(
        workspaceId,
        OBJECT_BATCH_SIZE
      );
      await this.emitBlobUpdates(result.workspaceIds);
      this.autoLog(
        `backfilled blob metadata workspace=${workspaceId} sid=${sid} upserted=${result.upsertedMetadata} scanned=${result.scannedObjects}`,
        Boolean(result.upsertedMetadata || result.failed)
      );
    });
  }

  async reconcileWorkspaceNamespaces(limit = 250) {
    const result = await this.rt.reconcileWorkspaceStorage(limit);
    metrics.storage
      .counter('workspace_reconciliation_deleted_objects_total')
      .add(Number(result.deletedObjects));
    metrics.storage
      .counter('workspace_reconciliation_deleted_rows_total')
      .add(Number(result.deletedOrphanRows));
    metrics.storage
      .gauge('workspace_reconciliation_unknown_prefixes')
      .record(Number(result.unknownPrefixes));
    metrics.storage
      .gauge('workspace_reconciliation_failed_shards')
      .record(Number(result.failedShards));
    if (result.failedShards || result.unknownPrefixes) {
      this.logger.warn(
        `workspace storage reconciliation failures=${result.failedShards} unknownPrefixes=${result.unknownPrefixes} failedScopes=${result.failedScopes.join(',')} unknownSamples=${result.unknownPrefixSamples.join(',')}`
      );
    }
    return result;
  }

  async reconcileWorkspaceBatch() {
    return await this.runWorkspaceSweep(
      'documents',
      async (workspaceId, sid) => {
        await this.rt.reconcileWorkspaceDocuments(workspaceId);
        const refs = await this.rt.rebuildWorkspaceDocBlobRefs(
          workspaceId,
          OBJECT_BATCH_SIZE
        );
        this.autoLog(
          `rebuilt doc blob refs workspace=${workspaceId} sid=${sid} parsed=${refs.parsedDocs} failed=${refs.failedDocs}`,
          Boolean(refs.failedDocs)
        );
        if (!(await this.hasObjectStorage('blob cleanup'))) {
          return;
        }
        const cleanup = await this.rt.cleanupUnreferencedWorkspaceBlobs(
          workspaceId,
          30,
          OBJECT_BATCH_SIZE
        );
        await this.emitBlobUpdates(cleanup.workspaceIds);
        this.autoLog(
          `cleaned blobs workspace=${workspaceId} sid=${sid} scanned=${cleanup.scannedBlobs} deleted=${cleanup.deletedObjects} protected=${cleanup.protectedByDocRefs + cleanup.protectedByMetadata + cleanup.protectedByOtherRefs} failed=${cleanup.failed}`,
          Boolean(cleanup.deletedObjects || cleanup.failed)
        );
      }
    );
  }

  async executeDocumentCleanup() {
    const result = await this.rt.executeDocumentCleanupCandidates(
      undefined,
      30,
      DOCUMENT_CLEANUP_BATCH_SIZE
    );
    metrics.storage
      .counter('document_cleanup_serialization_retry_total')
      .add(result.serializationRetries);
    metrics.storage
      .counter('document_cleanup_execute_failure_total')
      .add(result.failed);
    await this.recordDocumentCleanupHealth();
    return result;
  }

  private async runWorkspaceSweep(
    scope: SweepScope,
    run: (workspaceId: string, sid: number) => Promise<void>
  ) {
    const { lastSid, failures: previousFailures } =
      await this.loadSweepCursor(scope);
    const workspaces = await this.db.workspace.findMany({
      where: { sid: { gt: lastSid } },
      orderBy: { sid: 'asc' },
      select: { id: true, sid: true },
      take: WORKSPACE_BATCH_SIZE,
    });
    let failures = 0;
    let scanned = 0;
    let lastScannedSid = lastSid;
    for (const workspace of workspaces) {
      scanned++;
      lastScannedSid = workspace.sid;
      try {
        await run(workspace.id, workspace.sid);
      } catch (error) {
        failures++;
        this.logger.error(
          `storage ${scope} sweep failed workspace=${workspace.id} sid=${workspace.sid}`,
          error
        );
      }
    }
    const reachedEnd = workspaces.length < WORKSPACE_BATCH_SIZE;
    const totalFailures = previousFailures + failures;
    const completed = totalFailures === 0 && reachedEnd;
    await this.saveSweepCursor(
      scope,
      reachedEnd ? 0 : lastScannedSid,
      completed,
      reachedEnd ? 0 : totalFailures
    );
    return { scanned, failures, completed };
  }

  private async loadSweepCursor(scope: SweepScope) {
    const rows = await this.db.$queryRaw<
      { status: string; lastSid: number; failures: number }[]
    >`
      SELECT status, COALESCE((cursor->>'lastSid')::integer, 0) AS "lastSid",
        COALESCE((cursor->>'failures')::integer, 0) AS failures
      FROM storage_reconciliation_checkpoints
      WHERE kind = 'workspace_storage_sweep' AND scope = ${scope}
    `;
    return rows[0]?.status === 'completed'
      ? { lastSid: 0, failures: 0 }
      : { lastSid: rows[0]?.lastSid ?? 0, failures: rows[0]?.failures ?? 0 };
  }

  private async claimReconciliationLease(claimId: string) {
    const leaseUntil = new Date(Date.now() + RECONCILIATION_LEASE_MS);
    const rows = await this.db.$queryRaw<{ claimed: boolean }[]>`
      INSERT INTO storage_reconciliation_checkpoints
        (kind, scope, status, cursor, metadata)
      VALUES (
        'workspace_storage_job', 'global', 'running', '{}'::jsonb,
        jsonb_build_object('claimId', ${claimId}, 'leaseUntil', ${leaseUntil})
      )
      ON CONFLICT (kind, scope) DO UPDATE SET
        status = 'running',
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP
      WHERE COALESCE(
        (storage_reconciliation_checkpoints.metadata->>'leaseUntil')::timestamptz,
        '-infinity'::timestamptz
      ) <= CURRENT_TIMESTAMP
      RETURNING true AS claimed
    `;
    return rows[0]?.claimed ?? false;
  }

  private async releaseReconciliationLease(claimId: string) {
    await this.db.$executeRaw`
      UPDATE storage_reconciliation_checkpoints
      SET status = 'completed',
          metadata = '{}'::jsonb,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE kind = 'workspace_storage_job'
        AND scope = 'global'
        AND metadata->>'claimId' = ${claimId}
    `;
  }

  private async saveSweepCursor(
    scope: SweepScope,
    lastSid: number,
    completed: boolean,
    failures: number
  ) {
    const status = completed ? 'completed' : 'running';
    const cursor = JSON.stringify({ lastSid, failures });
    await this.db.$executeRaw`
      INSERT INTO storage_reconciliation_checkpoints
        (kind, scope, status, cursor, completed_at)
      VALUES (
        'workspace_storage_sweep', ${scope}, ${status}, ${cursor}::jsonb,
        CASE WHEN ${completed} THEN CURRENT_TIMESTAMP ELSE NULL END
      )
      ON CONFLICT (kind, scope) DO UPDATE SET
        status = EXCLUDED.status,
        cursor = EXCLUDED.cursor,
        completed_at = EXCLUDED.completed_at,
        updated_at = CURRENT_TIMESTAMP
    `;
  }

  private async recordDocumentCleanupHealth() {
    const [health] = await this.db.$queryRaw<
      {
        marked: bigint;
        failed: bigint;
        failedWorkspaceCheckpoints: bigint;
        oldestFailedSeconds: number | null;
      }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE status = 'marked') AS marked,
        COUNT(*) FILTER (WHERE status = 'failed') AS failed,
        EXTRACT(EPOCH FROM CURRENT_TIMESTAMP -
          MIN(updated_at) FILTER (WHERE status = 'failed'))::double precision AS "oldestFailedSeconds",
        (SELECT COUNT(*) FROM storage_reconciliation_checkpoints
          WHERE kind = 'document_cleanup' AND status = 'failed') AS "failedWorkspaceCheckpoints"
      FROM document_cleanup_candidates
    `;
    if (!health) return;
    for (const [name, value] of [
      ['document_cleanup_marked', health.marked],
      ['document_cleanup_failed', health.failed],
      [
        'document_cleanup_failed_workspace_checkpoints',
        health.failedWorkspaceCheckpoints,
      ],
    ] as const) {
      metrics.storage.gauge(name).record(Number(value));
    }
    metrics.storage
      .gauge('document_cleanup_oldest_failed_seconds')
      .record(health.oldestFailedSeconds ?? 0);
  }

  private async emitBlobUpdates(workspaceIds: string[]) {
    await Promise.all(
      [...new Set(workspaceIds)].map(workspaceId =>
        this.event.emitAsync('workspace.blobs.updated', { workspaceId })
      )
    );
  }

  private autoLog(message: string, detail: boolean) {
    if (detail) this.logger.log(message);
    else this.logger.verbose(message);
  }

  private async hasObjectStorage(operation: string) {
    const health = await this.rt.health();
    if (health.provider) return true;
    this.logger.warn(
      `skip ${operation}: StorageRuntime provider is not configured`
    );
    return false;
  }
}
