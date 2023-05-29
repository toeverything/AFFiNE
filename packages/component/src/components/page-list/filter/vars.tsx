import { MenuItem } from '../../../ui/menu';
import type { Filter } from './ast';
import { filterMatcher } from './filter-matcher';
import { tBoolean, tDate } from './logical/custom-type';
import type { TType } from './logical/typesystem';

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
