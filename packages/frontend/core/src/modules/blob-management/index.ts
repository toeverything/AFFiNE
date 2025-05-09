import { type Framework } from '@toeverything/infra';

import { DocsSearchService } from '../docs-search';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { WorkspaceFlavoursService } from '../workspace/services/flavours';
import { UnusedBlobs } from './entity/unused-blobs';
import { BlobManagementService } from './services';

export function configureBlobManagementModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .entity(UnusedBlobs, [
      WorkspaceFlavoursService,
      WorkspaceService,
      DocsSearchService,
    ])
    .service(BlobManagementService);
}
