import type { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { Service } from '@toeverything/infra';
import type { Observable } from 'rxjs';
import { switchMap } from 'rxjs';

import { GroupByProvider } from '../../provider';
import type { GroupByParams } from '../../types';

export class PropertyGroupByProvider
  extends Service
  implements GroupByProvider
{
  constructor(
    private readonly workspacePropertyService: WorkspacePropertyService
  ) {
    super();
  }

  groupBy$(
    items$: Observable<Set<string>>,
    params: GroupByParams
  ): Observable<Map<string, Set<string>>> {
    const property$ = this.workspacePropertyService.propertyInfo$(params.key);

    return property$.pipe(
      switchMap(property => {
        if (!property) {
          throw new Error('Unknown property');
        }
        const type = property.type;
        const provider = this.framework.getOptional(
          GroupByProvider('property:' + type)
        );
        if (!provider) {
          throw new Error('Unsupported property type');
        }
        return provider.groupBy$(items$, params);
      })
    );
  }
}
