import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { GroupByProvider } from '../../provider';
import type { GroupByParams } from '../../types';

export class NumberPropertyGroupByProvider
  extends Service
  implements GroupByProvider
{
  constructor(private readonly docsService: DocsService) {
    super();
  }

  groupBy$(
    _items$: Observable<Set<string>>,
    params: GroupByParams
  ): Observable<Map<string, Set<string>>> {
    return this.docsService.propertyValues$('custom:' + params.key).pipe(
      map(o => {
        const result = new Map<string, Set<string>>();
        for (const [id, value] of o) {
          const number = Number(value);
          if (Number.isNaN(number)) {
            continue;
          }
          // normalize all number to string
          const strValue = String(number);
          const set = result.get(strValue) ?? new Set<string>();
          set.add(id);
          result.set(strValue, set);
        }
        return result;
      })
    );
  }
}
