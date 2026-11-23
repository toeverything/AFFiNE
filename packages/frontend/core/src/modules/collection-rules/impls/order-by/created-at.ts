import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class CreatedAtOrderByProvider
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
    return this.docsService.allDocsCreatedDate$().pipe(
      map(docs => {
        if (params.desc) {
          return docs
            .sort((a, b) => (b.createDate ?? 0) - (a.createDate ?? 0))
            .map(doc => doc.id);
        } else {
          return docs
            .sort((a, b) => (a.createDate ?? 0) - (b.createDate ?? 0))
            .map(doc => doc.id);
        }
      })
    );
  }
}
