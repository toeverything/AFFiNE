import { getWorkspacePageMetaByIdQuery } from '@affine/graphql';
import { Store } from '@toeverything/infra';

import { type CloudDocMetaType } from '../entities/cloud-doc-meta';
import type { GraphQLService } from '../services/graphql';

export class CloudDocMetaStore extends Store {
  constructor(private readonly gqlService: GraphQLService) {
    super();
  }

  async fetchCloudDocMeta(
    workspaceId: string,
    docId: string,
    abortSignal?: AbortSignal
  ): Promise<CloudDocMetaType> {
    const serverConfigData = await this.gqlService.gql({
      query: getWorkspacePageMetaByIdQuery,
      variables: { id: workspaceId, pageId: docId },
      context: {
        signal: abortSignal,
      },
    });
    return serverConfigData.workspace.pageMeta;
  }
}
