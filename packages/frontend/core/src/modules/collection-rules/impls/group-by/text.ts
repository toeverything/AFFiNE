import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { GroupByProvider } from '../../provider';
import type { GroupByParams } from '../../types';

export class TextPropertyGroupByProvider
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
          if (value === undefined) {
            continue;
          }
          const set = result.get(value) ?? new Set<string>();
          set.add(id);
          result.set(value, set);
        }
        return result;
      })
    );
  }
}
