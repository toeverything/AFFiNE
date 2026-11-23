import type { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { Service } from '@toeverything/infra';
import { type Observable, switchMap } from 'rxjs';

import { OrderByProvider } from '../../provider';
import type { OrderByParams } from '../../types';

export class PropertyOrderByProvider
  extends Service
  implements OrderByProvider
{
  constructor(
    private readonly workspacePropertyService: WorkspacePropertyService
  ) {
    super();
  }

  orderBy$(
    items$: Observable<Set<string>>,
    params: OrderByParams
  ): Observable<string[]> {
    const property$ = this.workspacePropertyService.propertyInfo$(params.key);

    return property$.pipe(
      switchMap(property => {
        if (!property) {
          throw new Error('Unknown property');
        }
        const type = property.type;
        const provider = this.framework.getOptional(
          OrderByProvider('property:' + type)
        );
        if (!provider) {
          throw new Error('Unsupported property type');
        }
        return provider.orderBy$(items$, params);
      })
    );
  }
}
