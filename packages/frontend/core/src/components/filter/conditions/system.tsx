import type { FilterParams } from '@affine/core/modules/collection-rules';
import { useI18n } from '@affine/i18n';

import {
  isSupportedSystemPropertyType,
  SystemPropertyTypes,
} from '../../system-property-types';
import { Condition } from './condition';
import { UnknownFilterCondition } from './unknown';

export const SystemFilterCondition = ({
  filter,
  onChange,
}: {
  filter: FilterParams;
  onChange: (filter: FilterParams) => void;
}) => {
  const t = useI18n();
  const type = isSupportedSystemPropertyType(filter.key)
    ? SystemPropertyTypes[filter.key]
    : undefined;

  if (!type) {
    return <UnknownFilterCondition filter={filter} />;
  }

  const methods = type.filterMethod;
  const Value = type.filterValue;

  return (
    <Condition
      filter={filter}
      icon={<type.icon />}
      name={t.t(type.name)}
      methods={Object.entries(methods).map(([key, i18nKey]) => [
        key,
        t.t(i18nKey as string),
      ])}
      value={Value && <Value filter={filter} onChange={onChange} />}
      onChange={onChange}
    />
  );
};
