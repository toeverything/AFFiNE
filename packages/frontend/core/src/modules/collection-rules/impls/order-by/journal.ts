import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class JournalOrderByProvider extends Service implements OrderByProvider {
  constructor(private readonly docsService: DocsService) {
    super();
  }

  orderBy$(
    _items$: Observable<Set<string>>,
    params: OrderByParams
  ): Observable<string[]> {
    const isDesc = params.desc;
    return this.docsService.propertyValues$('journal').pipe(
      map(values => {
        return Array.from(values)
          .map(([id, value]) => ({
            id,
            isJournal: !!value,
          }))
          .sort((a, b) => {
            if (a.isJournal === b.isJournal) {
              return 0;
            }
            return (a.isJournal ? 1 : -1) * (isDesc ? -1 : 1);
          })
          .map(doc => doc.id);
      })
    );
  }
}
