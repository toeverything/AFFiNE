import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, PrismaClient } from '@prisma/client';

import { metrics } from '../../base';

const LOCK_NAMESPACE = 97_301;
const LOCK_KEY = 1;
const DIRTY_BATCH_SIZE = 500;
const FULL_REFRESH_BATCH_SIZE = 2000;
const TRANSACTION_TIMEOUT_MS = 120_000;

@Injectable()
export class WorkspaceStatsJob {
  private readonly logger = new Logger(WorkspaceStatsJob.name);

  constructor(private readonly prisma: PrismaClient) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async refreshDirty() {
    const started = Date.now();

    try {
      const result = await this.withAdvisoryLock(async tx => {
        const backlog = await this.countDirty(tx);
        metrics.workspace
          .gauge('admin_stats_dirty_backlog')
          .record(Number(backlog));

        const dirty = await this.loadDirty(tx, DIRTY_BATCH_SIZE);
        if (!dirty.length) {
          return { processed: 0, backlog };
        }

        await this.upsertStats(tx, dirty);
        await this.clearDirty(tx, dirty);
        return { processed: dirty.length, backlog };
      });

      if (!result) {
        this.logger.debug('skip admin stats refresh, lock not acquired');
        return;
      }

      metrics.workspace
        .histogram('admin_stats_refresh_duration_ms')
        .record(Date.now() - started, { mode: 'incremental' });

      if (result.processed > 0) {
        this.logger.log(
          `Refreshed admin stats for ${result.processed} workspace(s); backlog ${result.backlog}`
        );
      }
    } catch (error) {
      metrics.workspace.counter('admin_stats_refresh_failed').add(1, {
        mode: 'incremental',
      });
      this.logger.error('Failed to refresh admin stats', error as Error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async recalibrate() {
    let lastSid = 0;
    let processed = 0;

    while (true) {
      const started = Date.now();
      try {
        const result = await this.withAdvisoryLock(async tx => {
          const workspaces = await this.fetchWorkspaceBatch(
            tx,
            lastSid,
            FULL_REFRESH_BATCH_SIZE
          );
          if (!workspaces.length) {
            return { processed: 0, lastSid };
          }

          const ids = workspaces.map(({ id }) => id);
          await this.upsertStats(tx, ids);

          return {
            processed: ids.length,
            lastSid: workspaces[workspaces.length - 1].sid,
          };
        });

        if (!result) {
          this.logger.debug(
            'skip admin stats recalibration, lock not acquired'
          );
          break;
        }

        if (result.processed === 0) {
          break;
        }

        processed += result.processed;
        lastSid = result.lastSid;

        metrics.workspace
          .histogram('admin_stats_refresh_duration_ms')
          .record(Date.now() - started, { mode: 'full' });

        if (result.processed < FULL_REFRESH_BATCH_SIZE) {
          break;
        }
      } catch (error) {
        metrics.workspace.counter('admin_stats_refresh_failed').add(1, {
          mode: 'full',
        });
        this.logger.error(
          `Failed to recalibrate admin stats after sid ${lastSid}`,
          error as Error
        );
        break;
      }
    }

    if (processed > 0) {
      this.logger.verbose(
        `Recalibrate admin stats for ${processed} workspace(s) (last sid ${lastSid})`
      );
    }
  }

  private async withAdvisoryLock<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T | null> {
    const lockIdSql = Prisma.sql`(${LOCK_NAMESPACE}::bigint << 32) + ${LOCK_KEY}::bigint`;

    return await this.prisma.$transaction(
      async tx => {
        const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_lock(${lockIdSql}) AS locked
        `;

        if (!lock?.locked) {
          return null;
        }

        try {
          return await callback(tx);
        } finally {
          await tx.$executeRaw`SELECT pg_advisory_unlock(${lockIdSql})`;
        }
      },
      {
        maxWait: 5_000,
        timeout: TRANSACTION_TIMEOUT_MS,
      }
    );
  }

  private async loadDirty(
    tx: Prisma.TransactionClient,
    limit: number
  ): Promise<string[]> {
    const rows = await tx.$queryRaw<{ workspace_id: string }[]>`
      SELECT workspace_id
      FROM workspace_admin_stats_dirty
      ORDER BY updated_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;

    return rows.map(row => row.workspace_id);
  }

  private async countDirty(tx: Prisma.TransactionClient) {
    const [row] = await tx.$queryRaw<{ total: bigint | number }[]>`
      SELECT COUNT(*) AS total FROM workspace_admin_stats_dirty
    `;
    return row?.total ? Number(row.total) : 0;
  }

  private async clearDirty(
    tx: Prisma.TransactionClient,
    workspaceIds: string[]
  ) {
    if (!workspaceIds.length) {
      return;
    }

    await tx.$executeRaw`
      DELETE FROM workspace_admin_stats_dirty
      WHERE workspace_id IN (${Prisma.join(
        workspaceIds.map(id => Prisma.sql`${id}`)
      )})
    `;
  }

  private async upsertStats(
    tx: Prisma.TransactionClient,
    workspaceIds: string[]
  ) {
    if (!workspaceIds.length) {
      return;
    }

    const targetIds = Prisma.join(workspaceIds.map(id => Prisma.sql`${id}`));

    await tx.$executeRaw`
      WITH targets AS (
        SELECT UNNEST(ARRAY[${targetIds}]::varchar[]) AS workspace_id
      ),
      snapshot_stats AS (
        SELECT workspace_id,
               COUNT(*) AS snapshot_count,
               COALESCE(SUM(COALESCE(size, octet_length(blob))), 0) AS snapshot_size
        FROM snapshots
        WHERE workspace_id IN (SELECT workspace_id FROM targets)
        GROUP BY workspace_id
      ),
      blob_stats AS (
        SELECT workspace_id,
               COUNT(*) FILTER (WHERE deleted_at IS NULL AND status = 'completed') AS blob_count,
               COALESCE(SUM(size) FILTER (WHERE deleted_at IS NULL AND status = 'completed'), 0) AS blob_size
        FROM blobs
        WHERE workspace_id IN (SELECT workspace_id FROM targets)
        GROUP BY workspace_id
      ),
      member_stats AS (
        SELECT workspace_id, COUNT(*) AS member_count
        FROM workspace_user_permissions
        WHERE workspace_id IN (SELECT workspace_id FROM targets)
        GROUP BY workspace_id
      ),
      public_page_stats AS (
        SELECT workspace_id, COUNT(*) AS public_page_count
        FROM workspace_pages
        WHERE public = TRUE AND workspace_id IN (SELECT workspace_id FROM targets)
        GROUP BY workspace_id
      ),
      feature_stats AS (
        SELECT workspace_id,
               ARRAY_AGG(DISTINCT name ORDER BY name) FILTER (WHERE activated) AS features
        FROM workspace_features
        WHERE workspace_id IN (SELECT workspace_id FROM targets)
        GROUP BY workspace_id
      ),
      aggregated AS (
        SELECT t.workspace_id,
               COALESCE(ss.snapshot_count, 0) AS snapshot_count,
               COALESCE(ss.snapshot_size, 0) AS snapshot_size,
               COALESCE(bs.blob_count, 0) AS blob_count,
               COALESCE(bs.blob_size, 0) AS blob_size,
               COALESCE(ms.member_count, 0) AS member_count,
               COALESCE(pp.public_page_count, 0) AS public_page_count,
               COALESCE(fs.features, ARRAY[]::text[]) AS features
        FROM targets t
        LEFT JOIN snapshot_stats ss ON ss.workspace_id = t.workspace_id
        LEFT JOIN blob_stats bs ON bs.workspace_id = t.workspace_id
        LEFT JOIN member_stats ms ON ms.workspace_id = t.workspace_id
        LEFT JOIN public_page_stats pp ON pp.workspace_id = t.workspace_id
        LEFT JOIN feature_stats fs ON fs.workspace_id = t.workspace_id
      )
      INSERT INTO workspace_admin_stats (
        workspace_id,
        snapshot_count,
        snapshot_size,
        blob_count,
        blob_size,
        member_count,
        public_page_count,
        features,
        updated_at
      )
      SELECT
        workspace_id,
        snapshot_count,
        snapshot_size,
        blob_count,
        blob_size,
        member_count,
        public_page_count,
        features,
        NOW()
      FROM aggregated
      ON CONFLICT (workspace_id) DO UPDATE SET
        snapshot_count = EXCLUDED.snapshot_count,
        snapshot_size = EXCLUDED.snapshot_size,
        blob_count = EXCLUDED.blob_count,
        blob_size = EXCLUDED.blob_size,
        member_count = EXCLUDED.member_count,
        public_page_count = EXCLUDED.public_page_count,
        features = EXCLUDED.features,
        updated_at = EXCLUDED.updated_at
    `;
  }

  private async fetchWorkspaceBatch(
    tx: Prisma.TransactionClient,
    lastSid: number,
    limit: number
  ) {
    return tx.$queryRaw<{ id: string; sid: number }[]>`
      SELECT id, sid
      FROM workspaces
      WHERE sid > ${lastSid}
      ORDER BY sid
      LIMIT ${limit}
    `;
  }
}
