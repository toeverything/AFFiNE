import dayjs from 'dayjs';
import type { ReactNode } from 'react';

import { MenuItem } from '../../../ui/menu';
import * as styles from './index.css';
import { tBoolean, tDate } from './logical/custom-type';
import { Matcher } from './logical/matcher';
import type { TFunction } from './logical/typesystem';
import { tFunction, typesystem } from './logical/typesystem';
import type {
  Filter,
  FilterVariable,
  LiteralValue,
  VariableMap,
} from './shared-types';
import { variableDefineMap } from './shared-types';

export const vars: FilterVariable[] = Object.entries(variableDefineMap).map(
  ([key, value]) => ({
    name: key as keyof VariableMap,
    type: value.type,
    icon: value.icon,
  })
);

export const createDefaultFilter = (variable: FilterVariable): Filter => {
  const data = filterMatcher.match(variable.type);
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
}: {
  value: Filter[];
  onChange: (value: Filter[]) => void;
}) => {
  return (
    <VariableSelect
      selected={value}
      onSelect={filter => {
        onChange([...value, filter]);
      }}
    />
  );
};

export const VariableSelect = ({
  onSelect,
}: {
  selected: Filter[];
  onSelect: (value: Filter) => void;
}) => {
  return (
    <div data-testid="variable-select">
      <div className={styles.variableSelectTitleStyle}>Filter</div>
      <div className={styles.variableSelectDividerStyle}></div>
      {vars
        // .filter(v => !selected.find(filter => filter.left.name === v.name))
        .map(v => (
          <MenuItem
            icon={v.icon}
            key={v.name}
            onClick={() => {
              onSelect(createDefaultFilter(v));
            }}
            className={styles.menuItemStyle}
          >
            <div
              data-testid="variable-select-item"
              className={styles.menuItemTextStyle}
            >
              {v.name}
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
  impl: (...args: LiteralValue[]) => boolean;
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
