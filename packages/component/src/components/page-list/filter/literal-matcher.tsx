import type { LiteralValue, Tag } from '@affine/env/filter';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';

import { AFFiNEDatePicker } from '../../date-picker';
import { FilterTag } from './filter-tag-translation';
import { inputStyle } from './index.css';
import { tBoolean, tDate, tTag } from './logical/custom-type';
import { Matcher } from './logical/matcher';
import type { TType } from './logical/typesystem';
import { tArray, typesystem } from './logical/typesystem';
import { MultiSelect } from './multi-select';

export const literalMatcher = new Matcher<{
  render: (props: {
    type: TType;
    value: LiteralValue;
    onChange: (lit: LiteralValue) => void;
  }) => ReactNode;
}>((type, target) => {
  return typesystem.isSubtype(type, target);
});

literalMatcher.register(tBoolean.create(), {
  render: ({ value, onChange }) => (
    <div
      className={inputStyle}
      style={{ cursor: 'pointer' }}
      onClick={() => {
        onChange(!value);
      }}
    >
      <FilterTag name={value?.toString()} />
    </div>
  ),
});
literalMatcher.register(tDate.create(), {
  render: ({ value, onChange }) => (
    <AFFiNEDatePicker
      value={dayjs(value as number).format('YYYY-MM-DD')}
      onChange={e => {
        onChange(dayjs(e, 'YYYY-MM-DD').valueOf());
      }}
    />
  ),
});
const getTagsOfArrayTag = (type: TType): Tag[] => {
  if (type.type === 'array') {
    if (tTag.is(type.ele)) {
      return type.ele.data?.tags ?? [];
    }
    return [];
  } else {
    return [];
  }
};
literalMatcher.register(tArray(tTag.create()), {
  render: ({ type, value, onChange }) => {
    return (
      <MultiSelect
        value={(value ?? []) as string[]}
        onChange={value => onChange(value)}
        options={getTagsOfArrayTag(type).map(v => ({
          label: v.value,
          value: v.id,
        }))}
      ></MultiSelect>
    );
  },
});
