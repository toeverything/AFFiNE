import type {
  Filter,
  LiteralValue,
  PropertiesMeta,
  VariableMap,
} from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';

import { MenuItem } from '../../../ui/menu';
import { FilterTag } from './filter-tag-translation';
import * as styles from './index.css';
import { tBoolean, tDate, tTag } from './logical/custom-type';
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
    left: { type: 'ref', name: variable.name },
    funcName: data.name,
    args: data.defaultArgs().map(value => ({ type: 'literal', value })),
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
  const t = useAFFiNEI18N();
  return (
    <div data-testid="variable-select">
      <div className={styles.variableSelectTitleStyle}>
        {t['com.affine.filter']()}
      </div>
      <div className={styles.variableSelectDividerStyle}></div>
      {vars
        // .filter(v => !selected.find(filter => filter.left.name === v.name))
        .map(v => (
          <MenuItem
            icon={variableDefineMap[v.name].icon}
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
      return value == target;
    },
  }
);

filterMatcher.register(
  tFunction({ args: [tDate.create(), tDate.create()], rt: tBoolean.create() }),
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
  tFunction({ args: [tDate.create(), tDate.create()], rt: tBoolean.create() }),
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

filterMatcher.register(
  tFunction({ args: [tArray(tTag.create())], rt: tBoolean.create() }),
  {
    name: 'is not empty',
    defaultArgs: () => [],
    impl: tags => {
      if (Array.isArray(tags)) {
        return tags.length > 0;
      }
      return true;
    },
  }
);

filterMatcher.register(
  tFunction({ args: [tArray(tTag.create())], rt: tBoolean.create() }),
  {
    name: 'is empty',
    defaultArgs: () => [],
    impl: tags => {
      if (Array.isArray(tags)) {
        return tags.length == 0;
      }
      return true;
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
      if (Array.isArray(tags) && Array.isArray(target)) {
        return target.every(id => tags.includes(id));
      }
      return true;
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
      if (Array.isArray(tags) && Array.isArray(target)) {
        return target.some(id => tags.includes(id));
      }
      return true;
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
      if (Array.isArray(tags) && Array.isArray(target)) {
        return !target.every(id => tags.includes(id));
      }
      return true;
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
      if (Array.isArray(tags) && Array.isArray(target)) {
        return !target.some(id => tags.includes(id));
      }
      return true;
    },
  }
);
