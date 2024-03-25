import { Input, Menu, MenuItem } from '@affine/component';
import type { LiteralValue, Tag } from '@affine/env/filter';
import type { ReactNode } from 'react';

import { DateSelect } from './date-select';
import { FilterTag } from './filter-tag-translation';
import { inputStyle } from './index.css';
import { tBoolean, tDate, tDateRange, tTag } from './logical/custom-type';
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

literalMatcher.register(tDateRange.create(), {
  render: ({ value, onChange }) => (
    <Menu
      items={
        <div>
          <Input
            type="number"
            // Handle the input change and update the value accordingly
            onChange={i => (i ? onChange(parseInt(i)) : onChange(0))}
          />
          {[1, 2, 3, 7, 14, 30].map(i => (
            <MenuItem
              key={i}
              onClick={() => {
                // Handle the menu item click and update the value accordingly
                onChange(i);
              }}
            >
              {i} {i > 1 ? 'days' : 'day'}
            </MenuItem>
          ))}
        </div>
      }
    >
      <div>
        <span>{value.toString()}</span> {(value as number) > 1 ? 'days' : 'day'}
      </div>
    </Menu>
  ),
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
    <DateSelect value={value as number} onChange={onChange} />
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
