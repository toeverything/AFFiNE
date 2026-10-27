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
    blobId?: string,
    personal?: boolean
  ) {
    const task = await this.models.copilotTranscriptTask.getWithUser(
      userId,
      workspaceId,
      taskId,
      blobId,
      personal
    );
    return taskToJob(task);
  }

  async queryTaskInScope(input: {
    userId: string;
    workspaceId: string;
    taskId?: string;
    blobId?: string;
    personal: boolean;
  }) {
    return await this.queryTask(
      input.userId,
      input.workspaceId,
      input.taskId,
      input.blobId,
      input.personal
    );
  }
}
