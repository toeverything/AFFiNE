import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';

import { EventBus, metrics } from '../../base';
import { Models } from '../../models';
import {
  BackendRuntimeEmbeddingService,
  BackendRuntimeProvider,
} from '../backend-runtime';
import { DatabaseDocReader, DocStorageOptions } from '../doc';
import { StorageRuntimeProvider } from '../storage-runtime';

const DOC_BATCH_SIZE = 100;
const WORKSPACE_BATCH_SIZE = 100;

@Injectable()
export class DocJobRunner {
  private readonly logger = new Logger(DocJobRunner.name);
  private summaryWorkspaceCursor = 0;

  constructor(
    private readonly docReader: DatabaseDocReader,
    private readonly prisma: PrismaClient,
    private readonly models: Models,
    private readonly runtime: BackendRuntimeProvider,
    private readonly embedding: BackendRuntimeEmbeddingService,
    private readonly storageRuntime: StorageRuntimeProvider,
    private readonly options: DocStorageOptions,
    private readonly event: EventBus
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS, { waitForCompletion: true })
  async run() {
    await Promise.allSettled([
      this.compactPendingDocUpdates(),
      this.syncEmbeddingDocuments(),
      this.recordPendingDocUpdatesCount(),
      this.fixEmptySummaries(),
    ]).then(results => {
      for (const result of results) {
        if (result.status === 'rejected') {
          this.logger.error('document maintenance shard failed', result.reason);
        }
      }
    });
  }

  async syncEmbeddingDocuments() {
    if (!(await this.runtime.embeddingHealth()).enabled) {
      return {
        reconciledWorkspaces: 0,
        scannedDocuments: 0,
        syncedDocuments: 0,
      };
    }

    const roots = await this.prisma.$queryRaw<
      { id: string; lastCheckEmbeddings: Date }[]
    >`
      SELECT workspace.id, workspace.last_check_embeddings AS "lastCheckEmbeddings"
      FROM workspaces workspace
      JOIN snapshots root
        ON root.workspace_id = workspace.id AND root.guid = workspace.id
      WHERE workspace.last_check_embeddings <= root.updated_at
      ORDER BY workspace.last_check_embeddings, workspace.sid
      LIMIT ${WORKSPACE_BATCH_SIZE}
    `;
    let reconciledWorkspaces = 0;
    for (const workspace of roots) {
      const claimedAt = new Date();
      const claimed = await this.prisma.workspace.updateMany({
        where: {
          id: workspace.id,
          lastCheckEmbeddings: workspace.lastCheckEmbeddings,
        },
        data: { lastCheckEmbeddings: claimedAt },
      });
      if (!claimed.count) continue;
      try {
        await this.embedding.reconcileDocuments(workspace.id);
        reconciledWorkspaces++;
      } catch (error) {
        await this.prisma.workspace.updateMany({
          where: { id: workspace.id, lastCheckEmbeddings: claimedAt },
          data: { lastCheckEmbeddings: new Date(0) },
        });
        this.logger.error(
          `embedding workspace reconciliation failed workspace=${workspace.id}`,
          error
        );
      }
    }

    const documents = await this.prisma.$queryRaw<
      { workspaceId: string; docId: string }[]
    >`
      SELECT snapshot.workspace_id AS "workspaceId", snapshot.guid AS "docId"
      FROM snapshots snapshot
      JOIN workspaces workspace ON workspace.id = snapshot.workspace_id
      LEFT JOIN embedding_sources source
        ON source.workspace_id = snapshot.workspace_id
        AND source.source_kind = 'document'
        AND source.source_key = snapshot.guid
      WHERE workspace.enable_doc_embedding
        AND snapshot.guid <> snapshot.workspace_id
        AND snapshot.guid NOT LIKE 'db$%'
        AND snapshot.guid NOT LIKE 'userdata$%'
        AND (
          source.id IS NULL
          OR source.deleted_at IS NOT NULL
          OR source.content_revision <> ((extract(epoch FROM snapshot.updated_at) * 1000)::bigint)::text
        )
      ORDER BY snapshot.updated_at, snapshot.workspace_id, snapshot.guid
      LIMIT ${DOC_BATCH_SIZE}
    `;
    let syncedDocuments = 0;
    for (const document of documents) {
      try {
        await this.embedding.syncDocument(document.workspaceId, document.docId);
        syncedDocuments++;
      } catch (error) {
        this.logger.error(
          `document embedding sync failed workspace=${document.workspaceId} doc=${document.docId}`,
          error
        );
      }
    }
    return {
      reconciledWorkspaces,
      scannedDocuments: documents.length,
      syncedDocuments,
    };
  }

  async compactPendingDocUpdates() {
    const groups = await this.models.doc.groupedUpdatesCount(DOC_BATCH_SIZE);
    let merged = 0;
    for (const group of groups) {
      const historyMaxAgeMs = await this.options.historyMaxAge(
        group.workspaceId
      );
      try {
        const result = await this.runtime.compactPendingDocUpdates(
          group.workspaceId,
          group.id,
          DOC_BATCH_SIZE,
          this.options.historyMinInterval(group.workspaceId),
          Math.floor(historyMaxAgeMs / 1000)
        );
        if (!result.merged) continue;
        merged += Number(result.updatesMerged);
        const snapshot = await this.models.doc.getSnapshot(
          group.workspaceId,
          group.id,
          { select: { blob: true, updatedAt: true } }
        );
        if (snapshot) {
          await this.storageRuntime.rebuildDocBlobRefs(
            group.workspaceId,
            group.id,
            snapshot.updatedAt.getTime()
          );
          await this.event.emitAsync('doc.snapshot.updated', {
            workspaceId: group.workspaceId,
            docId: group.id,
            blob: Buffer.from(snapshot.blob),
          });
        }
      } catch (error) {
        this.logger.error(
          `document compaction failed workspace=${group.workspaceId} doc=${group.id}`,
          error
        );
      }
    }
    return { scanned: groups.length, merged };
  }

  async recordPendingDocUpdatesCount() {
    const count = await this.prisma.update.count();
    metrics.doc.gauge('pending_updates').record(count);
    return count;
  }

  async fixEmptySummaries() {
    let workspaces = await this.models.workspace.list(
      { sid: { gt: this.summaryWorkspaceCursor } },
      { id: true, sid: true },
      WORKSPACE_BATCH_SIZE
    );
    if (!workspaces.length && this.summaryWorkspaceCursor !== 0) {
      this.summaryWorkspaceCursor = 0;
      workspaces = await this.models.workspace.list(
        { sid: { gt: 0 } },
        { id: true, sid: true },
        WORKSPACE_BATCH_SIZE
      );
    }
    let fixed = 0;
    for (const workspace of workspaces) {
      const docIds = await this.models.doc.findEmptySummaryDocIds(workspace.id);
      for (const docId of docIds) {
        if (docId === workspace.id) continue;
        try {
          const content = await this.docReader.getDocContent(
            workspace.id,
            docId
          );
          if (!content) continue;
          await this.models.doc.upsertMeta(workspace.id, docId, content);
          fixed++;
        } catch (error) {
          this.logger.error(
            `document summary repair failed workspace=${workspace.id} doc=${docId}`,
            error
          );
        }
      }
    }
    this.summaryWorkspaceCursor =
      workspaces.length < WORKSPACE_BATCH_SIZE
        ? 0
        : (workspaces.at(-1)?.sid ?? this.summaryWorkspaceCursor);
    return { scanned: workspaces.length, fixed };
  }
}
