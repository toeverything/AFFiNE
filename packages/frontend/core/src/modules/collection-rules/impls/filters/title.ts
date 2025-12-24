import type { DocsSearchService } from '@affine/core/modules/docs-search';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class TitleFilterProvider extends Service implements FilterProvider {
  constructor(private readonly docsSearchService: DocsSearchService) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    const method = params.method as 'match';

    if (method === 'match') {
      return this.docsSearchService
        .searchTitle$(params.value ?? '')
        .pipe(map(list => new Set(list)));
    }

    throw new Error(`Unsupported method: ${params.method}`);
  }
}
