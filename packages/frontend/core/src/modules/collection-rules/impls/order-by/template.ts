import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class TemplateOrderByProvider
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
    return this.docsService.propertyValues$('isTemplate').pipe(
      map(values => {
        const docs = Array.from(values).map(([id, value]) => ({
          id,
          isTemplate: value ? 'true' : 'false',
        }));

        if (params.desc) {
          return docs
            .sort((a, b) => b.isTemplate.localeCompare(a.isTemplate))
            .map(doc => doc.id);
        } else {
          return docs
            .sort((a, b) => a.isTemplate.localeCompare(b.isTemplate))
            .map(doc => doc.id);
        }
      })
    );
  }
}
