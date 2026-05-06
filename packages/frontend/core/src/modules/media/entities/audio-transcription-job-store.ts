import {
  getTranscriptTaskQuery,
  retryTranscriptTaskMutation,
  settleTranscriptTaskMutation,
  submitTranscriptTaskMutation,
} from '@affine/graphql';
import { Entity } from '@toeverything/infra';

import type { DefaultServerService, WorkspaceServerService } from '../../cloud';
import { GraphQLService } from '../../cloud/services/graphql';
import type { WorkspaceService } from '../../workspace';

export class AudioTranscriptionJobStore extends Entity<{
  readonly blobId: string;
  readonly getAudioTranscriptionInput: () => Promise<{
    files: File[];
    input?: Record<string, unknown>;
  }>;
}> {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly defaultServerService: DefaultServerService
  ) {
    super();
  }

  private get serverService() {
    return (
      this.workspaceServerService.server || this.defaultServerService.server
    );
  }

  private get graphqlService() {
    return this.serverService?.scope.get(GraphQLService);
  }

  private get currentWorkspaceId() {
    return this.workspaceService.workspace.id;
  }

  submitTranscriptTask = async () => {
    const graphqlService = this.graphqlService;
    if (!graphqlService) {
      throw new Error('No graphql service available');
    }
    const { files, input } = await this.props.getAudioTranscriptionInput();
    const response = await graphqlService.gql({
      timeout: 0, // default 15s is too short for audio transcription
      query: submitTranscriptTaskMutation,
      variables: {
        workspaceId: this.currentWorkspaceId,
        blobId: this.props.blobId,
        blobs: files,
        input,
      },
    });
    if (!response.submitTranscriptTask?.id) {
      throw new Error('Failed to submit audio transcription');
    }
    return response.submitTranscriptTask;
  };

  retryTranscriptTask = async (taskId: string) => {
    const graphqlService = this.graphqlService;
    if (!graphqlService) {
      throw new Error('No graphql service available');
    }
    const response = await graphqlService.gql({
      query: retryTranscriptTaskMutation,
      variables: {
        taskId,
        workspaceId: this.currentWorkspaceId,
      },
    });
    if (!response.retryTranscriptTask) {
      throw new Error('Failed to retry audio transcription');
    }
    return response.retryTranscriptTask;
  };

  getTranscriptTask = async (blobId: string, taskId?: string) => {
    const graphqlService = this.graphqlService;
    if (!graphqlService) {
      throw new Error('No graphql service available');
    }
    const currentWorkspaceId = this.currentWorkspaceId;
    if (!currentWorkspaceId) {
      throw new Error('No current workspace id');
    }
    const response = await graphqlService.gql({
      query: getTranscriptTaskQuery,
      variables: {
        workspaceId: currentWorkspaceId,
        taskId,
        blobId,
      },
    });
    if (!response.currentUser?.copilot?.transcriptTask) {
      return null;
    }
    return response.currentUser.copilot.transcriptTask;
  };
  settleTranscriptTask = async (taskId: string) => {
    const graphqlService = this.graphqlService;
    if (!graphqlService) {
      throw new Error('No graphql service available');
    }
    const response = await graphqlService.gql({
      query: settleTranscriptTaskMutation,
      variables: {
        taskId,
        workspaceId: this.currentWorkspaceId,
      },
    });
    if (!response.settleTranscriptTask) {
      throw new Error('Failed to settle transcription result');
    }
    return response.settleTranscriptTask;
  };
}
