import {
  DocScope,
  DocService,
  type Framework,
  WorkspaceScope,
} from '@toeverything/infra';

import { DocsSearchService } from '../docs-search';
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
    .entity(DocBacklinks, [DocsSearchService, DocService])
    .entity(DocLinks, [DocsSearchService, DocService]);
}
