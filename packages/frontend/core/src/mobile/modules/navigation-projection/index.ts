import { CollectionService } from '@affine/core/modules/collection';
import { DocsService } from '@affine/core/modules/doc';
import { DocsSearchService } from '@affine/core/modules/docs-search';
import { FavoriteService } from '@affine/core/modules/favorite';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { OrganizeService } from '@affine/core/modules/organize';
import { GuardService } from '@affine/core/modules/permissions';
import { TagService } from '@affine/core/modules/tag';
import {
  WorkspaceScope,
  WorkspaceService,
} from '@affine/core/modules/workspace';
import type { Framework } from '@toeverything/infra';

import { MobileShellDataProjection } from './shell-data-projection';

export * from './navigation-projection';
export * from './shell-data-projection';

export function configureMobileNavigationProjection(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(MobileShellDataProjection, [
      DocsService,
      DocsSearchService,
      FavoriteService,
      GlobalContextService,
      GuardService,
      WorkspaceService,
      CollectionService,
      OrganizeService,
      TagService,
    ]);
}
