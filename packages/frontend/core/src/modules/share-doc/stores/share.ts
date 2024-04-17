import type { PublicPageMode } from '@affine/graphql';
import {
  getWorkspacePublicPageByIdQuery,
  publishPageMutation,
  revokePublicPageMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { GraphQLService } from '../../cloud';

export class ShareStore extends Store {
  constructor(private readonly gqlService: GraphQLService) {
    super();
  }

  async getShareInfoByDocId(
    workspaceId: string,
    docId: string,
    signal?: AbortSignal
  ) {
    const data = await this.gqlService.gql({
      query: getWorkspacePublicPageByIdQuery,
      variables: {
        pageId: docId,
        workspaceId,
      },
      context: {
        signal,
      },
    });
    return data.workspace.publicPage ?? undefined;
  }

  async enableSharePage(
    workspaceId: string,
    pageId: string,
    docMode?: PublicPageMode,
    signal?: AbortSignal
  ) {
    await this.gqlService.gql({
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
    await this.gqlService.gql({
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
