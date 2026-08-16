import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';

import { Config } from '../../../base/config';
import { CopilotTranscriptionJobNotFound } from '../../../base/error/errors.gen';
import { PermissionAccess } from '../../../core/permission';
import {
  RealtimeRegistry,
  realtimeTranscriptTaskRoom,
  registerRealtimeLiveQuery,
} from '../../../core/realtime';
import { assertCopilotEnabled } from '../availability';
import { CopilotTranscriptionReader } from './reader';
import { CopilotTranscriptionRetryService } from './retry';

@Injectable()
export class CopilotTranscriptRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly transcript: CopilotTranscriptionReader,
    private readonly retry: CopilotTranscriptionRetryService,
    private readonly registry: RealtimeRegistry,
    private readonly config: Config
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

    this.registry.registerRequest({
      name: 'copilot.transcript.task.retry',
      input: z.object({
        workspaceId: z.string(),
        taskId: z.string(),
      }),
      handle: async (user, input) => {
        await this.assertCopilot(user.id, input.workspaceId);
        return {
          task: await this.retry.retryTask(
            user.id,
            input.workspaceId,
            input.taskId
          ),
        };
      },
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
    assertCopilotEnabled(this.config);
    await this.ac
      .user(userId)
      .workspace(workspaceId)
      .allowLocal()
      .assert('Workspace.Copilot');
  }
}
