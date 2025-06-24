import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { GroupByProvider } from '../../provider';
import type { GroupByParams } from '../../types';

export class CheckboxPropertyGroupByProvider
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
      map(values => {
        const result = new Map<string, Set<string>>();
        for (const [id, value] of values) {
          // Treat undefined or any non-true value as false for checkbox grouping
          const v = value === 'true' ? 'true' : 'false';
          const set = result.get(v) ?? new Set<string>();
          set.add(id);
          result.set(v, set);
        }
        return result;
      })
    );
  }
}
