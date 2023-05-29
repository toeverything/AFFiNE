import dayjs from 'dayjs';
import type { ReactNode } from 'react';

import { MenuItem } from '../../../ui/menu';
import { tBoolean, tDate } from './logical/custom-type';
import { Matcher } from './logical/matcher';
import type { TFunction, TType } from './logical/typesystem';
import { tFunction, typesystem } from './logical/typesystem';

export type Ref = {
  type: 'ref';
  name: keyof VariableMap;
};

export type Filter = {
  type: 'filter';
  left: Ref;
  funcName: string;
  args: Literal[];
};

export type Literal = {
  type: 'literal';
  value: unknown;
};

export type FilterVariable = {
  name: keyof VariableMap;
  type: TType;
};
export const variableDefineMap = {
  Created: {
    type: tDate.create(),
  },
  Updated: {
    type: tDate.create(),
  },
  Favorite: {
    type: tBoolean.create(),
  },
  // Imported: {
  //   type: tBoolean.create(),
  // },
  // 'Daily Note': {
  //   type: tBoolean.create(),
  // },
} as const;
export type VariableMap = { [K in keyof typeof variableDefineMap]: unknown };
export const vars: FilterVariable[] = Object.entries(variableDefineMap).map(
  ([key, value]) => ({
    name: key as keyof VariableMap,
    type: value.type,
  })
);

const createDefaultFilter = (variable: FilterVariable): Filter => {
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
    <ChangeFilterMenu
      selected={value}
      onSelect={filter => {
        onChange([...value, filter]);
      }}
    />
  );
};

export const ChangeFilterMenu = ({
  onSelect,
}: {
  selected: Filter[];
  onSelect: (value: Filter) => void;
}) => {
  return (
    <div>
      {vars
        // .filter(v => !selected.find(filter => filter.left.name === v.name))
        .map(v => (
          <MenuItem
            key={v.name}
            onClick={() => {
              onSelect(createDefaultFilter(v));
            }}
          >
            {v.name}
          </MenuItem>
        ))}
    </div>
  );
};

export const filterMatcher = new Matcher<
  {
    name: string;
    defaultArgs: () => unknown[];
    render?: (props: { ast: Filter }) => ReactNode;
    impl: (...args: unknown[]) => boolean;
  },
  TFunction
>((type, target) => {
  const staticType = typesystem.subst(
    Object.fromEntries(type.typeVars?.map(v => [v.name, v.bound]) ?? []),
    type
  );
  const firstArg = staticType.args[0];
  return firstArg && typesystem.isSubtype(firstArg, target);
});

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
      return [dayjs().subtract(1, 'day').endOf('day')];
    },
    impl: (date, target) => {
      if (typeof date !== 'number' || !dayjs.isDayjs(target)) {
        throw new Error('argument type error');
      }
      return dayjs(date).isAfter(target.endOf('day'));
    },
  }
);

filterMatcher.register(
  tFunction({ args: [tDate.create(), tDate.create()], rt: tBoolean.create() }),
  {
    name: 'before',
    defaultArgs: () => [dayjs().endOf('day')],
    impl: (date, target) => {
      if (typeof date !== 'number' || !dayjs.isDayjs(target)) {
        throw new Error('argument type error');
      }
      return dayjs(date).isBefore(target.startOf('day'));
    },
  }
);
