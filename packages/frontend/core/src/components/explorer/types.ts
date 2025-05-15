import type { FilterParams } from '@affine/core/modules/collection-rules';
import type {
  GroupByParams,
  OrderByParams,
} from '@affine/core/modules/collection-rules/types';
import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import type { DocRecord } from '@affine/core/modules/doc';

export interface ExplorerPreference {
  filters?: FilterParams[];
  groupBy?: GroupByParams;
  orderBy?: OrderByParams;
  displayProperties?: string[];
  showDocIcon?: boolean;
  showDocPreview?: boolean;
  quickFavorite?: boolean;
  quickTrash?: boolean;
  quickSplit?: boolean;
  quickTab?: boolean;
  quickSelect?: boolean;
}

export interface DocListPropertyProps {
  value: any;
  doc: DocRecord;
  propertyInfo: DocCustomPropertyInfo;
}

export interface GroupHeaderProps {
  groupId: string;
  docCount: number;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
}
