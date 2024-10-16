import {
  DocsService,
  type Framework,
  WorkspaceScope,
} from '@toeverything/infra';

import { DocsSearchService } from '../docs-search';
import { DocInfoModal } from './entities/modal';
import { DocDatabaseBacklinksService } from './services/doc-database-backlinks';
import { DocInfoService } from './services/doc-info';

export { DocDatabaseBacklinkInfo } from './views/database-properties/doc-database-backlink-info';

export { DocInfoService };

export function configureDocInfoModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(DocInfoService)
    .service(DocDatabaseBacklinksService, [DocsService, DocsSearchService])
    .entity(DocInfoModal);
}
