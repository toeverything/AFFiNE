import type { FilterParams } from '@affine/core/modules/collection-rules';
import type {
  GroupByParams,
  OrderByParams,
} from '@affine/core/modules/collection-rules/types';

export interface ExplorerPreference {
  filters?: FilterParams[];
  groupBy?: GroupByParams;
  orderBy?: OrderByParams;
}
