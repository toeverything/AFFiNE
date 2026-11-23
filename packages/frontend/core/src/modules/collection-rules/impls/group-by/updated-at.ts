import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { GroupByProvider } from '../../provider';
import type { GroupByParams } from '../../types';

export class UpdatedAtGroupByProvider
  extends Service
  implements GroupByProvider
{
  constructor(private readonly docsService: DocsService) {
    super();
  }
  groupBy$(
    // not used in this implementation
    _items$: Observable<Set<string>>,
    _params: GroupByParams
  ): Observable<Map<string, Set<string>>> {
    return this.docsService.allDocsUpdatedDate$().pipe(
      map(docs => {
        const result = new Map<string, Set<string>>();
        docs.forEach(doc => {
          if (!doc.updatedDate) {
            return;
          }
          const date = new Date(doc.updatedDate);
          const formattedDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

          if (!result.has(formattedDate)) {
            result.set(formattedDate, new Set([doc.id]));
          } else {
            result.get(formattedDate)?.add(doc.id);
          }
        });
        return result;
      })
    );
  }
}
