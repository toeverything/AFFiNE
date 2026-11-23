import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class IntegrationTypeOrderByProvider
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
    return this.docsService.propertyValues$('integrationType').pipe(
      map(values => {
        const docs = Array.from(values)
          .filter(([, value]) => value !== undefined)
          .map(([id, value]) => ({
            id,
            type: value as string,
          }));

        if (params.desc) {
          return docs
            .sort((a, b) => b.type.localeCompare(a.type))
            .map(doc => doc.id);
        } else {
          return docs
            .sort((a, b) => a.type.localeCompare(b.type))
            .map(doc => doc.id);
        }
      })
    );
  }
}
