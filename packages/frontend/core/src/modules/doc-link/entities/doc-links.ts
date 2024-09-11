import type { DocService } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';

import type { DocsSearchService } from '../../docs-search';

export interface Link {
  docId: string;
  title: string;
  params?: URLSearchParams;
}

export class DocLinks extends Entity {
  constructor(
    private readonly docsSearchService: DocsSearchService,
    private readonly docService: DocService
  ) {
    super();
  }

  links$ = LiveData.from<Link[]>(
    this.docsSearchService.watchRefsFrom(this.docService.doc.id),
    []
  );
}
