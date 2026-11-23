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
  isDraft,
  onDraftCompleted,
  onChange,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  onChange: (filter: FilterParams) => void;
}) => {
  const t = useI18n();
  const type = isSupportedSystemPropertyType(filter.key)
    ? SystemPropertyTypes[filter.key]
    : undefined;

  if (!type) {
    return (
      <UnknownFilterCondition
        isDraft={isDraft}
        onDraftCompleted={onDraftCompleted}
        filter={filter}
      />
    );
  }

  const methods = type.filterMethod;
  const Value = type.filterValue;

  if (!methods || !Value) {
    return (
      <UnknownFilterCondition
        isDraft={isDraft}
        onDraftCompleted={onDraftCompleted}
        filter={filter}
      />
    );
  }

  return (
    <Condition
      filter={filter}
      icon={<type.icon />}
      isDraft={isDraft}
      onDraftCompleted={onDraftCompleted}
      name={t.t(type.name)}
      methods={Object.entries(methods).map(([key, i18nKey]) => [
        key,
        t.t(i18nKey as string),
      ])}
      value={Value}
      onChange={onChange}
    />
  );
};
