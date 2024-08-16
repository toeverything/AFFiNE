import { WorkspaceFlavour } from '@affine/env/workspace';
import type { WorkspaceService } from '@toeverything/infra';
import { Service } from '@toeverything/infra';

import { ShareDocsList } from '../entities/share-docs-list';

export class ShareDocsListService extends Service {
  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  shareDocs =
    this.workspaceService.workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD
      ? this.framework.createEntity(ShareDocsList)
      : null;
}
