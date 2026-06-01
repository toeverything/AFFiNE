import {
  retryTranscriptTaskMutation,
  settleTranscriptTaskMutation,
  submitTranscriptTaskMutation,
} from '@affine/graphql';
import { Framework } from '@toeverything/infra';
import { describe, expect, test, vi } from 'vitest';

import { DefaultServerService } from '../../cloud/services/default-server';
import { GraphQLService } from '../../cloud/services/graphql';
import { WorkspaceServerService } from '../../cloud/services/workspace-server';
import { NbstoreService } from '../../storage';
import { WorkspaceService } from '../../workspace';
import { AudioTranscriptionJobStore } from './audio-transcription-job-store';

type AudioTranscriptionInput = {
  files: File[];
  input?: Record<string, unknown>;
};

function createStore(
  gql: ReturnType<typeof vi.fn>,
  getAudioTranscriptionInput: () => Promise<AudioTranscriptionInput> = async () => ({
    files: [],
  })
) {
  const framework = new Framework();
  const server = {
    scope: {
      get: (key: unknown) => (key === GraphQLService ? { gql } : null),
    },
  };
  const realtime = {
    request: vi.fn().mockResolvedValue({ task: { id: 'task-2' } }),
    subscribe: vi.fn(),
  };
  framework
    .service(WorkspaceService, {
      workspace: { id: 'workspace-1' },
    } as WorkspaceService)
    .service(WorkspaceServerService, {
      server: {
        scope: server.scope,
      },
    } as WorkspaceServerService)
    .service(DefaultServerService, {
      server: null,
    } as unknown as DefaultServerService)
    .service(NbstoreService, {
      realtime,
    } as unknown as NbstoreService)
    .entity(AudioTranscriptionJobStore, [
      WorkspaceService,
      WorkspaceServerService,
      DefaultServerService,
      NbstoreService,
    ]);
  return framework.provider().createEntity(AudioTranscriptionJobStore, {
    blobId: 'blob-1',
    getAudioTranscriptionInput,
  });
}

describe('AudioTranscriptionJobStore transcript task API', () => {
  test('uses new transcript task mutations and query', async () => {
    const file = new File(['audio'], 'audio.webm', { type: 'audio/webm' });
    const gql = vi
      .fn()
      .mockResolvedValueOnce({ submitTranscriptTask: { id: 'task-1' } })
      .mockResolvedValueOnce({ retryTranscriptTask: { id: 'task-2' } })
      .mockResolvedValueOnce({ settleTranscriptTask: { id: 'task-2' } });
    const store = createStore(gql, async () => ({
      files: [file],
      input: { strategy: 'gemini' },
    }));

    await store.submitTranscriptTask();
    await store.retryTranscriptTask('task-1');
    await store.getTranscriptTask('blob-1', 'task-2');
    await store.settleTranscriptTask('task-2');

    expect(gql).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        query: submitTranscriptTaskMutation,
        variables: {
          workspaceId: 'workspace-1',
          blobId: 'blob-1',
          blobs: [file],
          input: { strategy: 'gemini' },
        },
      })
    );
    expect(gql).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        query: retryTranscriptTaskMutation,
        variables: {
          workspaceId: 'workspace-1',
          taskId: 'task-1',
        },
      })
    );
    expect(gql).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        query: settleTranscriptTaskMutation,
        variables: {
          workspaceId: 'workspace-1',
          taskId: 'task-2',
        },
      })
    );
  });
});
