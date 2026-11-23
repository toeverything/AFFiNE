import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class TitleOrderByProvider extends Service implements OrderByProvider {
  constructor(private readonly docsService: DocsService) {
    super();
  }
  orderBy$(
    _items$: Observable<Set<string>>,
    params: OrderByParams
  ): Observable<string[]> {
    const isDesc = params.desc;
    return this.docsService.allDocTitle$().pipe(
      map(o => {
        return o
          .sort(
            (a, b) =>
              (a.title === b.title ? 0 : a.title > b.title ? 1 : -1) *
              (isDesc ? -1 : 1)
          )
          .map(i => i.id);
      })
    );
  }
}
