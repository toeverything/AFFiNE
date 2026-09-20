import { Injectable } from '@nestjs/common';
import type { McpAccessMode } from '@prisma/client';

import { BaseModel } from './base';

export type CreateMcpCredential = {
  id: string;
  familyId: string;
  generation: number;
  name: string;
  secretHash: string;
  fingerprint: string;
  userId: string;
  workspaceId: string;
  accessMode: McpAccessMode;
  expiresAt: Date;
  graceEndsAt?: Date | null;
};

@Injectable()
export class McpCredentialModel extends BaseModel {
  list(userId: string, workspaceId: string) {
    return this.db.mcpCredential.findMany({
      where: { userId, workspaceId },
      orderBy: [{ familyId: 'asc' }, { generation: 'desc' }],
    });
  }

  create(input: CreateMcpCredential) {
    return this.db.mcpCredential.create({ data: input });
  }

  get(id: string) {
    return this.db.mcpCredential.findUnique({ where: { id } });
  }

  async revokeFamily(familyId: string, userId: string, workspaceId: string) {
    return await this.db.mcpCredential.updateMany({
      where: { familyId, userId, workspaceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async replace(
    id: string,
    userId: string,
    workspaceId: string,
    replacedById: string,
    expiresAt: Date
  ) {
    return await this.db.mcpCredential.updateMany({
      where: {
        id,
        userId,
        workspaceId,
        revokedAt: null,
        replacedById: null,
      },
      data: { replacedById, expiresAt },
    });
  }

  async authenticate(id: string, workspaceId: string) {
    const now = new Date();
    return await this.db.mcpCredential.findFirst({
      where: {
        id,
        workspaceId,
        revokedAt: null,
        expiresAt: { gt: now },
        user: { disabled: false },
      },
      include: { user: true },
    });
  }

  async touch(id: string, before: Date, now: Date) {
    await this.db.mcpCredential.updateMany({
      where: {
        id,
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: before } }],
      },
      data: { lastUsedAt: now },
    });
  }
}
