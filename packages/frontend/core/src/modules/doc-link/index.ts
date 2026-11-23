import { type Framework } from '@toeverything/infra';

import { DocScope } from '../doc/scopes/doc';
import { DocService } from '../doc/services/doc';
import { DocsService } from '../doc/services/docs';
import { DocsSearchService } from '../docs-search';
import { FeatureFlagService } from '../feature-flag';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { DocBacklinks } from './entities/doc-backlinks';
import { DocLinks } from './entities/doc-links';
import { DocLinksService } from './services/doc-links';

export type { Backlink } from './entities/doc-backlinks';
export type { Link } from './entities/doc-links';
export { DocLinksService } from './services/doc-links';

export function configureDocLinksModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .scope(DocScope)
    .service(DocLinksService)
    .entity(DocBacklinks, [
      DocsSearchService,
      DocService,
      DocsService,
      FeatureFlagService,
      WorkspaceService,
    ])
    .entity(DocLinks, [DocsSearchService, DocService]);
}
