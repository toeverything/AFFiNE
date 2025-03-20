import { Injectable } from '@nestjs/common';

import { BaseModel } from './base';

interface ChatSessionState {
  sessionId: string;
  workspaceId: string;
  docId: string;
  // connect ids
  userId: string;
  promptName: string;
}

// TODO(@darkskygit): not ready to replace business codes yet, just for test
@Injectable()
export class CopilotSessionModel extends BaseModel {
  async create(state: ChatSessionState) {
    const row = await this.db.aiSession.create({
      data: {
        id: state.sessionId,
        workspaceId: state.workspaceId,
        docId: state.docId,
        // connect
        userId: state.userId,
        promptName: state.promptName,
      },
    });
    return row;
  }

  async createPrompt(name: string, model: string) {
    await this.db.aiPrompt.create({
      data: { name, model },
    });
  }
}
