import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { z } from 'zod';

import { CopilotTranscriptionJobNotFound } from '../../../base';
import { AccessController } from '../../../core/permission';
import type { RealtimeRegistry } from '../../../core/realtime';
import { CopilotTranscriptionService, transcriptTaskRoom } from './service';

@Injectable()
export class CopilotTranscriptRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly ac: AccessController,
    private readonly transcript: CopilotTranscriptionService,
    @Optional() private readonly registry?: RealtimeRegistry
  ) {}

  onModuleInit() {
    this.registry?.registerRequest({
      name: 'copilot.transcript.task.get',
      input: z
        .object({
          workspaceId: z.string(),
          blobId: z.string().optional(),
          taskId: z.string().optional(),
        })
        .refine(input => input.blobId || input.taskId),
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
    });

    this.registry?.registerTopic({
      name: 'copilot.transcript.task.changed',
      input: z.object({
        workspaceId: z.string(),
        taskId: z.string(),
      }),
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
        transcriptTaskRoom(input.workspaceId, input.taskId),
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
