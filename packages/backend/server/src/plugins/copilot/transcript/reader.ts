import { Injectable } from '@nestjs/common';

import { Models } from '../../../models';
import { taskToJob } from './job';

@Injectable()
export class CopilotTranscriptionReader {
  constructor(private readonly models: Models) {}

  async queryTask(
    userId: string,
    workspaceId: string,
    taskId?: string,
    blobId?: string
  ) {
    const task = await this.models.copilotTranscriptTask.getWithUser(
      userId,
      workspaceId,
      taskId,
      blobId
    );
    return taskToJob(task);
  }
}
