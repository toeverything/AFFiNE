import type { GraphQLService } from '@affine/core/modules/cloud';
import {
  getEnableUrlPreviewQuery,
  setEnableUrlPreviewMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

export class WorkspaceShareSettingStore extends Store {
  constructor(private readonly graphqlService: GraphQLService) {
    super();
  }

  async fetchWorkspaceEnableUrlPreview(
    workspaceId: string,
    signal?: AbortSignal
  ) {
    const data = await this.graphqlService.gql({
      query: getEnableUrlPreviewQuery,
      variables: {
        id: workspaceId,
      },
      context: {
        signal,
      },
    });
    return data.workspace.enableUrlPreview;
  }

  async updateWorkspaceEnableUrlPreview(
    workspaceId: string,
    enableUrlPreview: boolean,
    signal?: AbortSignal
  ) {
    await this.graphqlService.gql({
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
