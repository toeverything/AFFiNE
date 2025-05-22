import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { GroupByProvider } from '../../provider';
import type { GroupByParams } from '../../types';

export class IntegrationTypeGroupByProvider
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
    return this.docsService.propertyValues$('integrationType').pipe(
      map(values => {
        const result = new Map<string, Set<string>>();
        for (const [id, value] of values) {
          const integrationType = value;
          if (!integrationType) {
            continue;
          }
          if (!result.has(integrationType)) {
            result.set(integrationType, new Set([id]));
          } else {
            result.get(integrationType)?.add(id);
          }
        }
        return result;
      })
    );
  }
}
