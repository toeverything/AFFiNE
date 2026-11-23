import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class DocPrimaryModeOrderByProvider
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
    return this.docsService.propertyValues$('primaryMode').pipe(
      map(values => {
        const docs = Array.from(values).map(([id, value]) => ({
          id,
          mode: value ?? 'page',
        }));

        if (params.desc) {
          return docs
            .sort((a, b) => b.mode.localeCompare(a.mode))
            .map(doc => doc.id);
        } else {
          return docs
            .sort((a, b) => a.mode.localeCompare(b.mode))
            .map(doc => doc.id);
        }
      })
    );
  }
}
