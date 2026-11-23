import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';
import { basicDateFilter } from './date';

export class UpdatedAtFilterProvider extends Service implements FilterProvider {
  constructor(private readonly docsService: DocsService) {
    super();
  }
  filter$(params: FilterParams): Observable<Set<string>> {
    return this.docsService.allDocsUpdatedDate$().pipe(
      map(docs => new Map(docs.map(doc => [doc.id, doc.updatedDate]))),
      basicDateFilter(params)
    );
  }
}
