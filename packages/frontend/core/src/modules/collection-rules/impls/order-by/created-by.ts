import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class CreatedByOrderByProvider
  extends Service
  implements OrderByProvider
{
  constructor(private readonly docsService: DocsService) {
    super();
  }
  orderBy$(
    _items$: Observable<Set<string>>,
    params: OrderByParams
  ): Observable<string[]> {
    const isDesc = params.desc;
    return this.docsService.propertyValues$('createdBy').pipe(
      map(o => {
        return Array.from(o)
          .filter((i): i is [string, string] => !!i[1]) // filter empty value
          .sort(
            (a, b) =>
              (a[1] === b[1] ? 0 : a[1] > b[1] ? 1 : -1) * (isDesc ? -1 : 1)
          )
          .map(i => i[0]);
      })
    );
  }
}
