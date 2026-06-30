import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import { EventBus, JobQueue, OnJob } from '../../base';
import { BackendRuntimeProvider } from './provider';

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
    'backendRuntime.rebuildWorkspaceDocBlobRefs': {
      workspaceId: string;
      limit?: number;
    };
    'backendRuntime.rebuildWorkspaceDocBlobRefsBySid': {
      lastSid?: number;
      workspaceLimit?: number;
      docLimit?: number;
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
  }
}

@Injectable()
export class BackendRuntimeBlobJob {
  private readonly logger = new Logger(BackendRuntimeBlobJob.name);

  constructor(
    private readonly rt: BackendRuntimeProvider,
    private readonly event: EventBus,
    private readonly queue: JobQueue,
    private readonly db: PrismaClient
  ) {}

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

  async enqueueRebuildWorkspaceDocBlobRefs(workspaceId: string, limit = 1000) {
    await this.queue.add('backendRuntime.rebuildWorkspaceDocBlobRefs', {
      workspaceId,
      limit,
    });
  }

  async enqueueRebuildWorkspaceDocBlobRefsBySid(
    lastSid = 0,
    workspaceLimit = 100,
    docLimit = 1000
  ) {
    await this.queue.add('backendRuntime.rebuildWorkspaceDocBlobRefsBySid', {
      lastSid,
      workspaceLimit,
      docLimit,
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

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async dailyBlobMetadataBackfill() {
    await this.queue.add(
      'backendRuntime.backfillMissingBlobMetadataBySid',
      {},
      { jobId: 'daily-backend-runtime-blob-metadata-backfill' }
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async dailyDocBlobRefsRebuild() {
    await this.queue.add(
      'backendRuntime.rebuildWorkspaceDocBlobRefsBySid',
      {},
      { jobId: 'daily-backend-runtime-doc-blob-refs-rebuild' }
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async dailyBlobCleanupPlanning() {
    await this.queue.add(
      'backendRuntime.planUnreferencedWorkspaceBlobsBySid',
      {},
      { jobId: 'daily-backend-runtime-blob-cleanup-planning' }
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

  @OnJob('backendRuntime.rebuildWorkspaceDocBlobRefs')
  async rebuildWorkspaceDocBlobRefs({
    workspaceId,
    limit = 1000,
  }: Jobs['backendRuntime.rebuildWorkspaceDocBlobRefs']) {
    await this.drainWorkspaceDocBlobRefs(workspaceId, limit);
  }

  @OnJob('backendRuntime.rebuildWorkspaceDocBlobRefsBySid')
  async rebuildWorkspaceDocBlobRefsBySid({
    lastSid = 0,
    workspaceLimit = 100,
    docLimit = 1000,
  }: Jobs['backendRuntime.rebuildWorkspaceDocBlobRefsBySid']) {
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
        await this.drainWorkspaceDocBlobRefs(workspace.id, docLimit, {
          sid: workspace.sid,
        });
      } catch (err) {
        this.logger.error(
          `doc blob refs rebuild failed workspace=${workspace.id} sid=${workspace.sid}`,
          err
        );
      }
    }

    const nextSid = workspaces.at(-1)?.sid;
    if (nextSid !== undefined && workspaces.length === workspaceLimit) {
      await this.enqueueRebuildWorkspaceDocBlobRefsBySid(
        nextSid,
        workspaceLimit,
        docLimit
      );
    }
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

    const result = await this.rt.planUnreferencedWorkspaceBlobs(
      workspaceId,
      gracePeriodDays,
      limit
    );
    this.logger.log(
      `planned blob cleanup workspace=${workspaceId} run=${result.runId} candidates=${result.candidatesMarked} scanned=${result.scannedBlobs}`
    );
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
        const result = await this.rt.planUnreferencedWorkspaceBlobs(
          workspace.id,
          gracePeriodDays,
          limit
        );
        this.logger.log(
          `planned blob cleanup workspace=${workspace.id} sid=${workspace.sid} run=${result.runId} candidates=${result.candidatesMarked} scanned=${result.scannedBlobs}`
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
      result.workspaceIds.map(workspaceId =>
        this.event.emitAsync('workspace.blobs.updated', { workspaceId })
      )
    );
    this.logger.log(
      `executed blob cleanup run=${runId} deleted=${result.deletedObjects} skipped=${result.skippedStillReferenced} failed=${result.failed}`
    );
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
        result.workspaceIds.map(workspaceId =>
          this.event.emitAsync('workspace.blobs.updated', { workspaceId })
        )
      );
      this.logger.log(
        `backfilled blob metadata workspace=${workspaceId}${context.sid === undefined ? '' : ` sid=${context.sid}`} upserted=${result.upsertedMetadata} scanned=${result.scannedObjects}`
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
      this.logger.log(
        `rebuilt doc blob refs workspace=${workspaceId}${context.sid === undefined ? '' : ` sid=${context.sid}`} parsed=${result.parsedDocs} failed=${result.failedDocs}`
      );
      if (!result.nextCursor) {
        break;
      }
    }
  }

  private async hasObjectStorage(operation: string) {
    const health = await this.rt.health();
    if (health.objectStorageConfigured) {
      return true;
    }

    this.logger.warn(
      `skip ${operation}: BackendRuntime object storage is not configured`
    );
    return false;
  }
}
