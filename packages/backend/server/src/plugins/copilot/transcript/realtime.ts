import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { z } from 'zod';

import { CopilotTranscriptionJobNotFound } from '../../../base';
import { AccessController } from '../../../core/permission';
import {
  type RealtimeRegistry,
  realtimeTranscriptTaskRoom,
  registerRealtimeLiveQuery,
} from '../../../core/realtime';
import { CopilotTranscriptionReader } from './reader';

@Injectable()
export class CopilotTranscriptRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly ac: AccessController,
    private readonly transcript: CopilotTranscriptionReader,
    @Optional() private readonly registry?: RealtimeRegistry
  ) {}

  onModuleInit() {
    const requestInput = z
      .object({
        workspaceId: z.string(),
        blobId: z.string().optional(),
        taskId: z.string().optional(),
      })
      .refine(input => input.blobId || input.taskId);
    const topicInput = z.object({
      workspaceId: z.string(),
      taskId: z.string(),
    });

    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'copilot.transcript.task.get',
        input: requestInput,
        handle: async (user, input) => {
          await this.assertCopilot(user.id, input.workspaceId);
          return {
            task: await this.transcript.queryTask(
              user.id,
              input.workspaceId,
              input.taskId,
              input.blobId
            ),
          };
        },
      },
      topic: {
        name: 'copilot.transcript.task.changed',
        input: topicInput,
        authorize: async (user, input) => {
          await this.assertCopilot(user.id, input.workspaceId);
          const task = await this.transcript.queryTask(
            user.id,
            input.workspaceId,
            input.taskId
          );
          if (!task) {
            throw new CopilotTranscriptionJobNotFound();
          }
        },
        room: (_user, input) =>
          realtimeTranscriptTaskRoom(input.workspaceId, input.taskId),
      },
    });
  }

  private async assertCopilot(userId: string, workspaceId: string) {
    await this.ac
      .user(userId)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');
  }
}
