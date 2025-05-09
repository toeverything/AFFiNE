import type { PublicDocMode } from '@affine/graphql';
import {
  getWorkspacePageByIdQuery,
  publishPageMutation,
  revokePublicPageMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { WorkspaceServerService } from '../../cloud';

export class ShareStore extends Store {
  constructor(private readonly workspaceServerService: WorkspaceServerService) {
    super();
  }

  async getShareInfoByDocId(
    workspaceId: string,
    docId: string,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const data = await this.workspaceServerService.server.gql({
      query: getWorkspacePageByIdQuery,
      variables: {
        pageId: docId,
        workspaceId,
      },
      context: {
        signal,
      },
    });
    return data.workspace.doc ?? undefined;
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
