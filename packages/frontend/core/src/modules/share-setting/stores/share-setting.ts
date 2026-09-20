import type { WorkspaceServerService } from '@affine/core/modules/cloud';
import {
  setEnableAiMutation,
  setEnableSharingMutation,
  setEnableUrlPreviewMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { NbstoreService } from '../../storage';

export class WorkspaceShareSettingStore extends Store {
  constructor(
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly nbstoreService: NbstoreService
  ) {
    super();
  }

  async fetchWorkspaceConfig(workspaceId: string, signal?: AbortSignal) {
    const { config } = await this.nbstoreService.realtime.request(
      'workspace.config.get',
      { workspaceId },
      { signal, timeoutMs: 10000 }
    );
    return config;
  }

  subscribeWorkspaceConfig(workspaceId: string) {
    return this.nbstoreService.realtime.subscribe('workspace.config.changed', {
      workspaceId,
    });
  }

  async fetchInviteLink(workspaceId: string, signal?: AbortSignal) {
    const { inviteLink } = await this.nbstoreService.realtime.request(
      'workspace.invite-link.get',
      { workspaceId },
      { signal, timeoutMs: 10000 }
    );
    return inviteLink;
  }

  subscribeInviteLink(workspaceId: string) {
    return this.nbstoreService.realtime.subscribe(
      'workspace.invite-link.changed',
      { workspaceId }
    );
  }

  async updateWorkspaceEnableAi(
    workspaceId: string,
    enableAi: boolean,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    await this.workspaceServerService.server.gql({
      query: setEnableAiMutation,
      variables: {
        id: workspaceId,
        enableAi,
      },
      context: {
        signal,
      },
    });
  }

  async updateWorkspaceEnableSharing(
    workspaceId: string,
    enableSharing: boolean,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    await this.workspaceServerService.server.gql({
      query: setEnableSharingMutation,
      variables: {
        id: workspaceId,
        enableSharing,
      },
      context: {
        signal,
      },
    });
  }

  async updateWorkspaceEnableUrlPreview(
    workspaceId: string,
    enableUrlPreview: boolean,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    await this.workspaceServerService.server.gql({
      query: setEnableUrlPreviewMutation,
      variables: {
        id: workspaceId,
        enableUrlPreview,
      },
      context: {
        signal,
      },
    });
  }
}
