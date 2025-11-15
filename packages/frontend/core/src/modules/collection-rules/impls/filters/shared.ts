import type { DocsService } from '@affine/core/modules/doc';
import type { ShareDocsListService } from '@affine/core/modules/share-doc';
import { onStart, Service } from '@toeverything/infra';
import { combineLatest, map, type Observable, of } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class SharedFilterProvider extends Service implements FilterProvider {
  constructor(
    private readonly shareDocsListService: ShareDocsListService,
    private readonly docsService: DocsService
  ) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    const method = params.method;
    if (method === 'is') {
      return combineLatest([
        this.shareDocsListService.shareDocs?.list$ ??
          (of([]) as Observable<{ id: string }[]>),
        this.docsService.allDocIds$(),
      ]).pipe(
        onStart(() => {
          this.shareDocsListService.shareDocs?.revalidate();
        }),
        map(([shareDocsList, allDocIds]) => {
          const shareDocIds = new Set(shareDocsList.map(item => item.id));
          if (params.value === 'true') {
            return shareDocIds;
          } else if (params.value === 'false') {
            const notShareDocIds = new Set<string>();
            for (const id of allDocIds) {
              if (!shareDocIds.has(id)) {
                notShareDocIds.add(id);
              }
            }
            return notShareDocIds;
          } else {
            throw new Error(`Unsupported value: ${params.value}`);
          }
        })
      );
    }
    throw new Error(`Unsupported method: ${params.method}`);
  }
}
