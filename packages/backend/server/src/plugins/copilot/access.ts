import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import {
  type DocAction,
  PermissionAccess,
  type WorkspaceAction,
} from '../../core/permission';

type SessionScope = {
  userId: string;
  workspaceId: string;
  docId?: string | null;
  action?: DocAction | WorkspaceAction;
};

type TranscriptResource = {
  taskId?: string;
  blobId?: string;
};

export type CopilotScopeMode = 'personal' | 'canonical';

@Injectable()
export class CopilotAccessService {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly db: PrismaClient
  ) {}

  private async workspaceMode(workspaceId: string): Promise<CopilotScopeMode> {
    const [workspace] = await this.db.$queryRaw<Array<{ exists: boolean }>>(
      Prisma.sql`SELECT EXISTS(SELECT 1 FROM workspaces WHERE id=${workspaceId}) AS exists`
    );
    return workspace?.exists ? 'canonical' : 'personal';
  }

  async sessionCollection(scope: SessionScope): Promise<CopilotScopeMode> {
    const mode = await this.workspaceMode(scope.workspaceId);
    if (mode === 'canonical') await this.assertCanonical(scope);
    return mode;
  }

  async sessionResource(
    scope: SessionScope,
    sessionIds: string[]
  ): Promise<CopilotScopeMode> {
    const mode = await this.workspaceMode(scope.workspaceId);
    if (mode === 'canonical') {
      await this.assertCanonical(scope);
      return mode;
    }
    if (
      sessionIds.length &&
      !(await this.isActorSessionResource(
        scope.userId,
        scope.workspaceId,
        sessionIds
      ))
    ) {
      await this.assertCanonical(scope);
    }
    return mode;
  }

  async filterSessionDocs<T extends { sessionId: string; docId: string }>(
    scope: SessionScope,
    items: T[],
    mode: CopilotScopeMode
  ) {
    if (mode === 'personal') return items;
    return await this.ac
      .user(scope.userId)
      .workspace(scope.workspaceId)
      .docs(items, (scope.action as DocAction | undefined) ?? 'Doc.Update');
  }

  async transcriptSubmission(
    userId: string,
    workspaceId: string
  ): Promise<CopilotScopeMode> {
    const mode = await this.workspaceMode(workspaceId);
    if (mode === 'canonical') {
      await this.ac
        .user(userId)
        .workspace(workspaceId)
        .assert('Workspace.Copilot');
    }
    return mode;
  }

  async transcriptResource(
    userId: string,
    workspaceId: string,
    resource: TranscriptResource
  ): Promise<CopilotScopeMode> {
    const mode = await this.workspaceMode(workspaceId);
    if (
      mode === 'canonical' ||
      !(await this.isActorTranscriptResource(userId, workspaceId, resource))
    ) {
      await this.ac
        .user(userId)
        .workspace(workspaceId)
        .assert('Workspace.Copilot');
    }
    return mode;
  }

  private async assertCanonical(scope: SessionScope) {
    if (scope.docId) {
      await this.ac
        .user(scope.userId)
        .doc({ workspaceId: scope.workspaceId, docId: scope.docId })
        .assert((scope.action as DocAction | undefined) ?? 'Doc.Update');
      return;
    }
    await this.ac
      .user(scope.userId)
      .workspace(scope.workspaceId)
      .assert(
        (scope.action as WorkspaceAction | undefined) ?? 'Workspace.Copilot'
      );
  }

  private async isActorSessionResource(
    userId: string,
    workspaceId: string,
    sessionIds: string[]
  ) {
    if (sessionIds.length === 0) {
      return true;
    }
    const ids = Prisma.join(sessionIds.map(id => Prisma.sql`${id}`));
    const [row] = await this.db.$queryRaw<Array<{ allowed: boolean }>>(
      Prisma.sql`
        SELECT
          NOT EXISTS(
            SELECT 1
            FROM unnest(ARRAY[${ids}]::text[]) AS requested(id)
            WHERE NOT EXISTS(
              SELECT 1 FROM ai_sessions_metadata session
              WHERE session.id::text=requested.id
                AND session.user_id=${userId}
                AND session.workspace_id=${workspaceId}
                AND session.deleted_at IS NULL
            )
          ) AS allowed
      `
    );
    return row?.allowed === true;
  }

  private async isActorTranscriptResource(
    userId: string,
    workspaceId: string,
    resource: TranscriptResource
  ) {
    if (!resource.taskId && !resource.blobId) {
      return false;
    }
    const taskPredicate = resource.taskId
      ? Prisma.sql`task.id=${resource.taskId}`
      : Prisma.sql`TRUE`;
    const blobPredicate = resource.blobId
      ? Prisma.sql`task.blob_id=${resource.blobId}`
      : Prisma.sql`TRUE`;
    const [row] = await this.db.$queryRaw<Array<{ allowed: boolean }>>(
      Prisma.sql`
        SELECT
          EXISTS(
            SELECT 1 FROM ai_transcript_tasks task
            WHERE task.user_id=${userId}
              AND task.workspace_id=${workspaceId}
              AND ${taskPredicate}
              AND ${blobPredicate}
          ) AS allowed
      `
    );
    return row?.allowed === true;
  }
}
