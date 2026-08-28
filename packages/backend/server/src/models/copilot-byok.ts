import { Injectable } from '@nestjs/common';

import { BaseModel } from './base';

@Injectable()
export class CopilotWorkspaceByokConfigModel extends BaseModel {
  async markFailure(workspaceId: string, id: string, message: string) {
    await this.db.aiWorkspaceByokConfig.updateMany({
      where: { id, workspaceId },
      data: {
        lastError: message,
        lastErrorAt: new Date(),
      },
    });
  }

  async touchUsed(workspaceId: string, id: string) {
    await this.db.aiWorkspaceByokConfig.updateMany({
      where: { id, workspaceId },
      data: { lastUsedAt: new Date() },
    });
  }
}
