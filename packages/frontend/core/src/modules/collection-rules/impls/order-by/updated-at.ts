import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class UpdatedAtOrderByProvider
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
    return this.docsService.allDocsUpdatedDate$().pipe(
      map(docs => {
        if (params.desc) {
          return docs
            .filter(doc => doc.updatedDate)
            .sort((a, b) => (b.updatedDate ?? 0) - (a.updatedDate ?? 0))
            .map(doc => doc.id);
        } else {
          return docs
            .filter(doc => doc.updatedDate)
            .sort((a, b) => (a.updatedDate ?? 0) - (b.updatedDate ?? 0))
            .map(doc => doc.id);
        }
      })
    );
  }
}
