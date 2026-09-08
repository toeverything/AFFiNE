import { Injectable, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';

import { Config } from '../../../base/config';
import { CopilotTranscriptionJobNotFound } from '../../../base/error/errors.gen';
import {
  RealtimeRegistry,
  realtimeTranscriptTaskRoom,
  registerRealtimeLiveQuery,
} from '../../../core/realtime';
import { CopilotAccessService } from '../access';
import { assertCopilotEnabled } from '../availability';
import { CopilotTranscriptionReader } from './reader';
import { CopilotTranscriptionRetryService } from './retry';

@Injectable()
export class CopilotTranscriptRealtimeProvider implements OnModuleInit {
  constructor(
    private readonly access: CopilotAccessService,
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
        return {
          task: await this.withCopilot(
            user.id,
            input.workspaceId,
            { taskId: input.taskId },
            personal =>
              this.retry.retryTask(
                user.id,
                input.workspaceId,
                input.taskId,
                personal
              )
          ),
        };
      },
    });

    registerRealtimeLiveQuery(this.registry, {
      request: {
        name: 'copilot.transcript.task.get',
        input: requestInput,
        handle: async (user, input) => {
          return {
            task: await this.withCopilot(
              user.id,
              input.workspaceId,
              { taskId: input.taskId, blobId: input.blobId },
              personal =>
                this.transcript.queryTaskInScope({
                  userId: user.id,
                  workspaceId: input.workspaceId,
                  taskId: input.taskId,
                  blobId: input.blobId,
                  personal,
                })
            ),
          };
        },
      },
      topic: {
        name: 'copilot.transcript.task.changed',
        input: topicInput,
        authorize: async (user, input) => {
          const task = await this.withCopilot(
            user.id,
            input.workspaceId,
            { taskId: input.taskId },
            personal =>
              this.transcript.queryTaskInScope({
                userId: user.id,
                workspaceId: input.workspaceId,
                taskId: input.taskId,
                personal,
              })
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

  private async withCopilot<T>(
    userId: string,
    workspaceId: string,
    resource: { taskId?: string; blobId?: string },
    operation: (personal: boolean) => Promise<T>
  ) {
    assertCopilotEnabled(this.config);
    const mode = await this.access.transcriptResource(
      userId,
      workspaceId,
      resource
    );
    return await operation(mode === 'personal');
  }
}
