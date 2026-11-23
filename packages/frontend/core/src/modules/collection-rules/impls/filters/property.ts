import type { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { Service } from '@toeverything/infra';
import { type Observable, switchMap } from 'rxjs';

import { FilterProvider } from '../../provider';
import type { FilterParams } from '../../types';

export class PropertyFilterProvider extends Service implements FilterProvider {
  constructor(
    private readonly workspacePropertyService: WorkspacePropertyService
  ) {
    super();
  }

  filter$(params: FilterParams): Observable<Set<string>> {
    const property$ = this.workspacePropertyService.propertyInfo$(params.key);

    return property$.pipe(
      switchMap(property => {
        if (!property) {
          throw new Error('Unknown property');
        }
        const type = property.type;
        const provider = this.framework.getOptional(
          FilterProvider('property:' + type)
        );
        if (!provider) {
          throw new Error(`Unsupported property type: ${type}`);
        }
        return provider.filter$(params);
      })
    );
  }
}
