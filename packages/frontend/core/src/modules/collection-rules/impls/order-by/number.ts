import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class NumberPropertyOrderByProvider
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
    return this.docsService.propertyValues$('custom:' + params.key).pipe(
      map(o => {
        return Array.from(o)
          .map(v => [v[0], Number(v[1])])
          .filter((i): i is [string, number] => !Number.isNaN(i[1])) // filter NaN value
          .sort((a, b) => (a[1] - b[1]) * (isDesc ? -1 : 1))
          .map(i => i[0]);
      })
    );
  }
}
