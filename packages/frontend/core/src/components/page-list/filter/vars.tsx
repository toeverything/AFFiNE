import { MenuItem, MenuSeparator } from '@affine/component';
import type {
  Filter,
  LiteralValue,
  PropertiesMeta,
  VariableMap,
} from '@affine/env/filter';
import { useI18n } from '@affine/i18n';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';

import { FilterTag } from './filter-tag-translation';
import * as styles from './index.css';
import { tBoolean, tDate, tDateRange, tTag } from './logical/custom-type';
import { Matcher } from './logical/matcher';
import type { TFunction } from './logical/typesystem';
import {
  tArray,
  tFunction,
  tTypeRef,
  tTypeVar,
  typesystem,
} from './logical/typesystem';
import type { FilterVariable } from './shared-types';
import { variableDefineMap } from './shared-types';

export const vars: FilterVariable[] = Object.entries(variableDefineMap).map(
  ([key, value]) => ({
    name: key as keyof VariableMap,
    type: value.type,
    icon: value.icon,
  })
);

export const createDefaultFilter = (
  variable: FilterVariable,
  propertiesMeta: PropertiesMeta
): Filter => {
  const data = filterMatcher.match(variable.type(propertiesMeta));
  if (!data) {
    throw new Error('No matching function found');
  }
  return {
    type: 'filter',
    left: {
      type: 'ref',
      name: variable.name,
    },
    funcName: data.name,
    args: data.defaultArgs().map(value => ({
      type: 'literal',
      value,
    })),
  };
};

export const CreateFilterMenu = ({
  value,
  onChange,
  propertiesMeta,
}: {
  value: Filter[];
  onChange: (value: Filter[]) => void;
  propertiesMeta: PropertiesMeta;
}) => {
  return (
    <VariableSelect
      propertiesMeta={propertiesMeta}
      selected={value}
      onSelect={filter => {
        onChange([...value, filter]);
      }}
    />
  );
};
export const VariableSelect = ({
  onSelect,
  propertiesMeta,
}: {
  selected: Filter[];
  onSelect: (value: Filter) => void;
  propertiesMeta: PropertiesMeta;
}) => {
  const t = useI18n();
  return (
    <div data-testid="variable-select">
      <div className={styles.variableSelectTitleStyle}>
        {t['com.affine.filter']()}
      </div>
      <MenuSeparator />
      {vars
        // .filter(v => !selected.find(filter => filter.left.name === v.name))
        .map(v => (
          <MenuItem
            prefixIcon={variableDefineMap[v.name].icon}
            key={v.name}
            onClick={() => {
              onSelect(createDefaultFilter(v, propertiesMeta));
            }}
            className={styles.menuItemStyle}
          >
            <div
              data-testid="variable-select-item"
              className={styles.menuItemTextStyle}
            >
              <FilterTag name={v.name} />
            </div>
          </MenuItem>
        ))}
    </div>
  );
};

export type FilterMatcherDataType = {
  name: string;
  defaultArgs: () => LiteralValue[];
  render?: (props: { ast: Filter }) => ReactNode;
  impl: (...args: (LiteralValue | undefined)[]) => boolean;
};
export const filterMatcher = new Matcher<FilterMatcherDataType, TFunction>(
  (type, target) => {
    const staticType = typesystem.subst(
      Object.fromEntries(type.typeVars?.map(v => [v.name, v.bound]) ?? []),
      type
    );
    const firstArg = staticType.args[0];
    return firstArg && typesystem.isSubtype(firstArg, target);
  }
);

filterMatcher.register(
  tFunction({
    args: [tBoolean.create(), tBoolean.create()],
    rt: tBoolean.create(),
  }),
  {
    name: 'is',
    defaultArgs: () => [true],
    impl: (value, target) => {
      return value === target;
    },
  }
);

filterMatcher.register(
  tFunction({
    args: [tDate.create(), tDate.create()],
    rt: tBoolean.create(),
  }),
  {
    name: 'after',
    defaultArgs: () => {
      return [dayjs().subtract(1, 'day').endOf('day').valueOf()];
    },
    impl: (date, target) => {
      if (typeof date !== 'number' || typeof target !== 'number') {
        throw new Error('argument type error');
      }
      return dayjs(date).isAfter(dayjs(target).endOf('day'));
    },
  }
);

filterMatcher.register(
  tFunction({
    args: [tDate.create(), tDateRange.create()],
    rt: tBoolean.create(),
  }),
  {
    name: 'last',
    defaultArgs: () => [30], // Default to the last 30 days
    impl: (date, n) => {
      if (typeof date !== 'number' || typeof n !== 'number') {
        throw new Error('Argument type error: date and n must be numbers');
      }
      const startDate = dayjs().subtract(n, 'day').startOf('day').valueOf();
      return date > startDate;
    },
  }
);

filterMatcher.register(
  tFunction({
    args: [tDate.create(), tDate.create()],
    rt: tBoolean.create(),
  }),
  {
    name: 'before',
    defaultArgs: () => [dayjs().endOf('day').valueOf()],
    impl: (date, target) => {
      if (typeof date !== 'number' || typeof target !== 'number') {
        throw new Error('argument type error');
      }
      return dayjs(date).isBefore(dayjs(target).startOf('day'));
    },
  }
);
const safeArray = (arr: unknown): LiteralValue[] => {
  return Array.isArray(arr) ? arr : [];
};
filterMatcher.register(
  tFunction({
    args: [tArray(tTag.create())],
    rt: tBoolean.create(),
  }),
  {
    name: 'is not empty',
    defaultArgs: () => [],
    impl: tags => {
      const safeTags = safeArray(tags);
      return safeTags.length > 0;
    },
  }
);

filterMatcher.register(
  tFunction({
    args: [tArray(tTag.create())],
    rt: tBoolean.create(),
  }),
  {
    name: 'is empty',
    defaultArgs: () => [],
    impl: tags => {
      const safeTags = safeArray(tags);
      return safeTags.length === 0;
    },
  }
);

filterMatcher.register(
  tFunction({
    typeVars: [tTypeVar('T', tTag.create())],
    args: [tArray(tTypeRef('T')), tArray(tTypeRef('T'))],
    rt: tBoolean.create(),
  }),
  {
    name: 'contains all',
    defaultArgs: () => [],
    impl: (tags, target) => {
      if (!Array.isArray(target)) {
        return true;
      }
      const safeTags = safeArray(tags);
      return target.every(id => safeTags.includes(id));
    },
  }
);

filterMatcher.register(
  tFunction({
    typeVars: [tTypeVar('T', tTag.create())],
    args: [tArray(tTypeRef('T')), tArray(tTypeRef('T'))],
    rt: tBoolean.create(),
  }),
  {
    name: 'contains one of',
    defaultArgs: () => [],
    impl: (tags, target) => {
      if (!Array.isArray(target)) {
        return true;
      }
      const safeTags = safeArray(tags);
      return target.some(id => safeTags.includes(id));
    },
  }
);

filterMatcher.register(
  tFunction({
    typeVars: [tTypeVar('T', tTag.create())],
    args: [tArray(tTypeRef('T')), tArray(tTypeRef('T'))],
    rt: tBoolean.create(),
  }),
  {
    name: 'does not contains all',
    defaultArgs: () => [],
    impl: (tags, target) => {
      if (!Array.isArray(target)) {
        return true;
      }
      const safeTags = safeArray(tags);
      return !target.every(id => safeTags.includes(id));
    },
  }
);

filterMatcher.register(
  tFunction({
    typeVars: [tTypeVar('T', tTag.create())],
    args: [tArray(tTypeRef('T')), tArray(tTypeRef('T'))],
    rt: tBoolean.create(),
  }),
  {
    name: 'does not contains one of',
    defaultArgs: () => [],
    impl: (tags, target) => {
      if (!Array.isArray(target)) {
        return true;
      }
      const safeTags = safeArray(tags);
      return !target.some(id => safeTags.includes(id));
    },
  }
);
