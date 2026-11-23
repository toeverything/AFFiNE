import {
  DocRole,
  PublicDocMode,
  publishPageMutation,
  revokePublicPageMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { WorkspaceServerService } from '../../cloud';
import { mapRealtimeEnum } from '../../cloud/realtime/enum';
import type { NbstoreService } from '../../storage';

export class ShareStore extends Store {
  constructor(
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly nbstoreService: NbstoreService
  ) {
    super();
  }

  async getShareInfoByDocId(
    workspaceId: string,
    docId: string,
    signal?: AbortSignal
  ) {
    const { state } = await this.nbstoreService.realtime.request(
      'doc.share-state.get',
      { workspaceId, docId },
      { signal, timeoutMs: 10000 }
    );
    return state
      ? {
          id: docId,
          ...state,
          mode: mapRealtimeEnum(PublicDocMode, state.mode, 'public doc mode'),
          defaultRole: mapRealtimeEnum(DocRole, state.defaultRole, 'doc role'),
          title: null,
          summary: null,
        }
      : undefined;
  }

  subscribeShareState(workspaceId: string, docId: string) {
    return this.nbstoreService.realtime.subscribe('doc.share-state.changed', {
      workspaceId,
      docId,
    });
  }

  async enableSharePage(
    workspaceId: string,
    pageId: string,
    docMode?: PublicDocMode,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    await this.workspaceServerService.server.gql({
      query: publishPageMutation,
      variables: {
        pageId,
        workspaceId,
        mode: docMode,
      },
      context: {
        signal,
      },
    });
  }

  async disableSharePage(
    workspaceId: string,
    pageId: string,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    await this.workspaceServerService.server.gql({
      query: revokePublicPageMutation,
      variables: {
        pageId,
        workspaceId,
      },
      context: {
        signal,
      },
    });
  }
}
