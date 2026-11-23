import type { DocsService } from '@affine/core/modules/doc';
import type { WorkspacePropertyFilter } from '@affine/core/modules/workspace-property';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class UpdatedByFilterProvider extends Service implements FilterProvider {
  constructor(private readonly docsService: DocsService) {
    super();
  }
  filter$(params: FilterParams): Observable<Set<string>> {
    const method = params.method as WorkspacePropertyFilter<'updatedBy'>;
    if (method === 'include') {
      const userIds = params.value?.split(',').filter(Boolean) ?? [];

      return this.docsService.propertyValues$('updatedBy').pipe(
        map(o => {
          const match = new Set<string>();
          for (const [id, value] of o) {
            if (value && userIds.includes(value)) {
              match.add(id);
            }
          }
          return match;
        })
      );
    }
    throw new Error(`Unsupported method: ${params.method}`);
  }
}
