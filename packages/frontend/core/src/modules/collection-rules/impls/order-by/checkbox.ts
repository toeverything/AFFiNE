import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { combineLatest, map, type Observable } from 'rxjs';

import type { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class CheckboxPropertyOrderByProvider
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
    return combineLatest([
      this.docsService.list.docs$, // We need the complete doc list as docs without property values should default to false
      this.docsService.propertyValues$('custom:' + params.key),
    ]).pipe(
      map(([docs, values]) => {
        const result: [string, boolean][] = [];
        for (const doc of docs) {
          const value = values.get(doc.id) === 'true' ? true : false;
          result.push([doc.id, value]);
        }
        return result
          .sort(
            (a, b) => (a[1] === b[1] ? 0 : a[1] ? 1 : -1) * (isDesc ? -1 : 1)
          )
          .map(i => i[0]);
      })
    );
  }
}
