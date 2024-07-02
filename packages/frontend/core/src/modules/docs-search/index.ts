export { DocsSearchService } from './services/docs-search';

import {
  type Framework,
  WorkspaceScope,
  WorkspaceService,
} from '@toeverything/infra';

import { DocsIndexer } from './entities/docs-indexer';
import { DocsSearchService } from './services/docs-search';

export function configureDocsSearchModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(DocsSearchService)
    .entity(DocsIndexer, [WorkspaceService]);
}
