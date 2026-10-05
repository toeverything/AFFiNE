/** @vitest-environment happy-dom */

import type { TranscriptionBlockProps } from '@affine/core/blocksuite/ai/blocks/transcription-block/model';
import { AiJobStatus } from '@affine/graphql';
import { Framework } from '@toeverything/infra';
import { describe, expect, test, vi } from 'vitest';

import { AuthService } from '../../cloud/services/auth';
import { DefaultServerService } from '../../cloud/services/default-server';
import { WorkspaceServerService } from '../../cloud/services/workspace-server';
import { NbstoreService } from '../../storage';
import { WorkspaceService } from '../../workspace';
import { AudioTranscriptionJob } from './audio-transcription-job';
import { AudioTranscriptionJobStore } from './audio-transcription-job-store';

describe('AudioTranscriptionJob', () => {
  test('only retries a failed task after explicit user intent', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        task: { id: 'task-1', status: AiJobStatus.failed },
      })
      .mockResolvedValueOnce({
        task: { id: 'task-1', status: AiJobStatus.failed },
      })
      .mockResolvedValueOnce({
        task: { id: 'task-1', status: AiJobStatus.failed },
      });
    const server = {
      scope: {
        get: () => null,
        getOptional: (key: unknown) =>
          key === AuthService
            ? { session: { account$: { value: { id: 'user-1' } } } }
            : null,
      },
    };
    const framework = new Framework();
    framework
      .service(WorkspaceService, {
        workspace: { id: 'workspace-1' },
      } as WorkspaceService)
      .service(WorkspaceServerService, {
        server,
      } as unknown as WorkspaceServerService)
      .service(DefaultServerService, {
        server: null,
      } as unknown as DefaultServerService)
      .service(NbstoreService, {
        realtime: { request },
      } as unknown as NbstoreService)
      .entity(AudioTranscriptionJobStore, [
        WorkspaceService,
        WorkspaceServerService,
        DefaultServerService,
        NbstoreService,
      ])
      .entity(AudioTranscriptionJob, [
        WorkspaceServerService,
        DefaultServerService,
      ]);

    const job = framework.provider().createEntity(AudioTranscriptionJob, {
      blobId: 'blob-1',
      blockProps: {
        jobId: 'task-1',
        createdBy: 'user-1',
      } as TranscriptionBlockProps,
      getAudioTranscriptionInput: async () => ({ files: [] }),
    });

    const resumed = await job.start(false);

    expect(resumed.status).toBe(AiJobStatus.failed);
    expect(request).toHaveBeenCalledTimes(1);

    const [first, second] = await Promise.all([
      job.start(true),
      job.start(true),
    ]);

    expect(first.status).toBe(AiJobStatus.failed);
    expect(second).toBe(first);
    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenNthCalledWith(
      1,
      'copilot.transcript.task.get',
      {
        workspaceId: 'workspace-1',
        taskId: 'task-1',
        blobId: 'blob-1',
      },
      { timeoutMs: 10000 }
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      'copilot.transcript.task.get',
      {
        workspaceId: 'workspace-1',
        taskId: 'task-1',
        blobId: 'blob-1',
      },
      { timeoutMs: 10000 }
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      'copilot.transcript.task.retry',
      { workspaceId: 'workspace-1', taskId: 'task-1' }
    );
  });
});
