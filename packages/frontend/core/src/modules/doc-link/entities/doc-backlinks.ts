import type { DocService } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';

import type { DocsSearchService } from '../../docs-search';

export interface Backlink {
  docId: string;
  blockId: string;
  title: string;
}

export class DocBacklinks extends Entity {
  constructor(
    private readonly docsSearchService: DocsSearchService,
    private readonly docService: DocService
  ) {
    super();
  }

  backlinks$ = LiveData.from<Backlink[]>(
    this.docsSearchService.watchRefsTo(this.docService.doc.id),
    []
  );
}
