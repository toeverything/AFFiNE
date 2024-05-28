import type { GraphQLService } from '@affine/core/modules/cloud';
import { getIsOwnerQuery, leaveWorkspaceMutation } from '@affine/graphql';
import { Store } from '@toeverything/infra';

export class WorkspacePermissionStore extends Store {
  constructor(private readonly graphqlService: GraphQLService) {
    super();
  }

  async fetchIsOwner(workspaceId: string, signal?: AbortSignal) {
    const isOwner = await this.graphqlService.gql({
      query: getIsOwnerQuery,
      variables: {
        workspaceId,
      },
      context: { signal },
    });

    return isOwner.isOwner;
  }

  /**
   * @param workspaceName for send email
   */
  async leaveWorkspace(workspaceId: string, workspaceName: string) {
    await this.graphqlService.gql({
      query: leaveWorkspaceMutation,
      variables: {
        workspaceId,
        workspaceName,
      },
    });
  }
}
