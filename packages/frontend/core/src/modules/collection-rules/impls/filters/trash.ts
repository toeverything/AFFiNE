import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class TrashFilterProvider extends Service implements FilterProvider {
  constructor(private readonly docsService: DocsService) {
    super();
  }
  filter$(params: FilterParams): Observable<Set<string>> {
    if (params.value === 'true') {
      return this.docsService.allTrashDocIds$().pipe(map(ids => new Set(ids)));
    } else {
      return this.docsService
        .allNonTrashDocIds$()
        .pipe(map(ids => new Set(ids)));
    }
  }
}
