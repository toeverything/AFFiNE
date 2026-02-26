import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { OnEvent } from '../../base';
import { Models } from '../../models';

const IGNORED_PRISMA_CODES = new Set(['P2003', 'P2025', 'P2028']);

function isIgnorablePermissionEventError(error: unknown) {
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
export class EventsListener {
  private readonly logger = new Logger(EventsListener.name);

  constructor(private readonly models: Models) {}

  @OnEvent('doc.created')
  async setDefaultPageOwner(payload: Events['doc.created']) {
    const { workspaceId, docId, editor } = payload;

    if (!editor) {
      return;
    }

    const workspace = await this.models.workspace.get(workspaceId);
    if (!workspace) {
      this.logger.warn(
        `Skip default doc owner event for missing workspace ${workspaceId}/${docId}`
      );
      return;
    }

    const user = await this.models.user.get(editor);
    if (!user) {
      this.logger.warn(
        `Skip default doc owner event for missing editor ${workspaceId}/${docId}/${editor}`
      );
      return;
    }

    try {
      await this.models.docUser.setOwner(workspaceId, docId, editor);
    } catch (error) {
      if (isIgnorablePermissionEventError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Ignore stale doc owner event for ${workspaceId}/${docId}/${editor}: ${message}`
        );
        return;
      }
      throw error;
    }
  }
}
