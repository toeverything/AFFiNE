import { getDocCreatedByUpdatedByListQuery } from '@affine/graphql';
import { Store, yjsGetPath } from '@toeverything/infra';
import type { Observable } from 'rxjs';

import type { WorkspaceService } from '../../workspace';
import type { WorkspaceServerService } from '../services/workspace-server';

export class DocCreatedByUpdatedBySyncStore extends Store {
  constructor(
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }

  async getDocCreatedByUpdatedByList(afterCursor?: string | null) {
    if (!this.workspaceServerService.server) {
      throw new Error('Server not found');
    }

    return await this.workspaceServerService.server.gql({
      query: getDocCreatedByUpdatedByListQuery,
      variables: {
        workspaceId: this.workspaceService.workspace.id,
        pagination: {
          first: 100,
          after: afterCursor,
        },
      },
    });
  }

  watchDocCreatedByUpdatedBySynced() {
    const rootYDoc = this.workspaceService.workspace.rootYDoc;
    return yjsGetPath(
      rootYDoc.getMap('affine:workspace-properties'),
      'docCreatedByUpdatedBySynced'
    ) as Observable<boolean>;
  }

  setDocCreatedByUpdatedBySynced(synced: boolean) {
    const rootYDoc = this.workspaceService.workspace.rootYDoc;
    rootYDoc
      .getMap('affine:workspace-properties')
      .set('docCreatedByUpdatedBySynced', synced);
  }
}
