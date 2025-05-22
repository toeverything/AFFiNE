import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { GroupByProvider } from '../../provider';
import type { GroupByParams } from '../../types';

export class TemplateGroupByProvider
  extends Service
  implements GroupByProvider
{
  constructor(private readonly docsService: DocsService) {
    super();
  }

  groupBy$(
    _items$: Observable<Set<string>>,
    _params: GroupByParams
  ): Observable<Map<string, Set<string>>> {
    return this.docsService.propertyValues$('isTemplate').pipe(
      map(values => {
        const result = new Map<string, Set<string>>();
        for (const [id, value] of values) {
          const isTemplate = value ? 'true' : 'false';
          if (!result.has(isTemplate)) {
            result.set(isTemplate, new Set([id]));
          } else {
            result.get(isTemplate)?.add(id);
          }
        }
        return result;
      })
    );
  }
}
