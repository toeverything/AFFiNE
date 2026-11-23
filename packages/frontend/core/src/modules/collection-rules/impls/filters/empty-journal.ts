import type { DocsService } from '@affine/core/modules/doc';
import { Service } from '@toeverything/infra';
import { combineLatest, map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class EmptyJournalFilterProvider
  extends Service
  implements FilterProvider
{
  constructor(private readonly docsService: DocsService) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    return combineLatest([
      this.docsService.allDocsUpdatedDate$(),
      this.docsService.propertyValues$('journal'),
    ]).pipe(
      map(([updatedAts, journalValues]) => {
        const match = new Set<string>();

        for (const { id, updatedDate } of updatedAts) {
          const isJournal = journalValues.get(id);
          const isEmptyJournal = updatedDate === undefined && isJournal;
          if (
            (params.value === 'false' && !isEmptyJournal) ||
            (params.value === 'true' && isEmptyJournal)
          ) {
            match.add(id);
          }
        }

        return match;
      })
    );
  }
}
