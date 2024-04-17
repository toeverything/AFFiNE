import type { GraphQLService } from '@affine/core/modules/cloud';
import { getWorkspacePublicPagesQuery } from '@affine/graphql';
import { Store } from '@toeverything/infra';

export class ShareDocsStore extends Store {
  constructor(private readonly graphqlService: GraphQLService) {
    super();
  }

  async getWorkspacesShareDocs(workspaceId: string, signal?: AbortSignal) {
    const data = await this.graphqlService.gql({
      query: getWorkspacePublicPagesQuery,
      variables: {
        workspaceId: workspaceId,
      },
      context: {
        signal,
      },
    });
    return data.workspace.publicPages;
  }
}
