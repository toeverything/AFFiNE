import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class IntegrationTypeFilterProvider
  extends Service
  implements FilterProvider
{
  constructor(private readonly docsService: DocsService) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    const method = params.method as 'is' | 'is-not';
    if (method === 'is') {
      return this.docsService.propertyValues$('integrationType').pipe(
        map(values => {
          const match = new Set<string>();
          for (const [id, value] of values) {
            if (value === params.value) {
              match.add(id);
            }
          }
          return match;
        })
      );
    } else if (method === 'is-not') {
      return this.docsService.propertyValues$('integrationType').pipe(
        map(values => {
          const match = new Set<string>();
          for (const [id, value] of values) {
            if (value !== params.value) {
              match.add(id);
            }
          }
          return match;
        })
      );
    }
    throw new Error(`Unsupported method: ${params.method}`);
  }
}
