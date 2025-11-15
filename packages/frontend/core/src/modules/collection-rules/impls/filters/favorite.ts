import type { DocsService } from '@affine/core/modules/doc';
import type { FavoriteService } from '@affine/core/modules/favorite';
import { Service } from '@toeverything/infra';
import { combineLatest, map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class FavoriteFilterProvider extends Service implements FilterProvider {
  constructor(
    private readonly favoriteService: FavoriteService,
    private readonly docsService: DocsService
  ) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    const method = params.method;
    if (method === 'is') {
      return combineLatest([
        this.favoriteService.favoriteList.list$,
        this.docsService.allDocIds$(),
      ]).pipe(
        map(([favoriteList, allDocIds]) => {
          const favoriteDocIds = new Set<string>();
          for (const { id, type } of favoriteList) {
            if (type === 'doc') {
              favoriteDocIds.add(id);
            }
          }
          if (params.value === 'true') {
            return favoriteDocIds;
          } else if (params.value === 'false') {
            const notFavoriteDocIds = new Set<string>();
            for (const id of allDocIds) {
              if (!favoriteDocIds.has(id)) {
                notFavoriteDocIds.add(id);
              }
            }
            return notFavoriteDocIds;
          } else {
            throw new Error(`Unsupported value: ${params.value}`);
          }
        })
      );
    }
    throw new Error(`Unsupported method: ${params.method}`);
  }
}
