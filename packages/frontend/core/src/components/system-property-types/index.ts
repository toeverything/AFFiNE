import type { FilterParams } from '@affine/core/modules/collection-rules';
import type { I18nString } from '@affine/i18n';
import { TagIcon } from '@blocksuite/icons/rc';

import { TagsFilterValue } from './tags';

export const SystemPropertyTypes = {
  tags: {
    icon: TagIcon,
    name: 'Tags',
    filterMethod: {
      include: 'com.affine.filter.contains all',
      'is-not-empty': 'com.affine.filter.is not empty',
      'is-empty': 'com.affine.filter.is empty',
    },
    filterValue: TagsFilterValue,
  },
} satisfies {
  [type: string]: {
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    name: I18nString;

    allowInOrderBy?: boolean;
    allowInGroupBy?: boolean;
    filterMethod: { [key: string]: I18nString };
    filterValue: React.FC<{
      filter: FilterParams;
      onChange: (filter: FilterParams) => void;
    }>;
  };
};

export type SystemPropertyType = keyof typeof SystemPropertyTypes;

export const isSupportedSystemPropertyType = (
  type?: string
): type is SystemPropertyType => {
  return type ? type in SystemPropertyTypes : false;
};
