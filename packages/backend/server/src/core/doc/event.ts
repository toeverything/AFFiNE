import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { OnEvent } from '../../base';
import { Models } from '../../models';
import { PgWorkspaceDocStorageAdapter } from './adapters/workspace';
import { DocReader } from './reader';

const IGNORED_PRISMA_CODES = new Set(['P2003', 'P2025', 'P2028']);

function isIgnorableDocEventError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return IGNORED_PRISMA_CODES.has(error.code);
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /transaction is aborted|transaction already closed/i.test(
      error.message
    );
  }
  return false;
}

@Injectable()
export class DocEventsListener {
  private readonly logger = new Logger(DocEventsListener.name);

  constructor(
    private readonly docReader: DocReader,
    private readonly models: Models,
    private readonly workspace: PgWorkspaceDocStorageAdapter
  ) {}

  @OnEvent('doc.snapshot.updated')
  async markDocContentCacheStale({
    workspaceId,
    docId,
    blob,
  }: Events['doc.snapshot.updated']) {
    await this.docReader.markDocContentCacheStale(workspaceId, docId);
    const workspace = await this.models.workspace.get(workspaceId);
    if (!workspace) {
      this.logger.warn(
        `Skip stale doc snapshot event for missing workspace ${workspaceId}/${docId}`
      );
      return;
    }
    const isDoc = workspaceId !== docId;
    // update doc content to database
    try {
      if (isDoc) {
        const content = this.docReader.parseDocContent(blob);
        if (!content) {
          return;
        }
        await this.models.doc.upsertMeta(workspaceId, docId, content);
      } else {
        // update workspace content to database
        const content = this.docReader.parseWorkspaceContent(blob);
        if (!content) {
          return;
        }
        await this.models.workspace.update(workspaceId, content);
      }
    } catch (error) {
      if (isIgnorableDocEventError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Ignore stale doc snapshot event for ${workspaceId}/${docId}: ${message}`
        );
        return;
      }
      throw error;
    }
  }

  @OnEvent('user.deleted')
  async clearUserWorkspaces(payload: Events['user.deleted']) {
    for (const workspace of payload.ownedWorkspaces) {
      await this.models.workspace.delete(workspace);
      await this.workspace.deleteSpace(workspace);
    }
  }
}
