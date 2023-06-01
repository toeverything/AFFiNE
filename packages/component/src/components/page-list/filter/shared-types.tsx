import { DateTimeIcon, FavoritedIcon } from '@blocksuite/icons';
import type { ReactElement } from 'react';

import { tBoolean, tDate } from './logical/custom-type';
import type { TType } from './logical/typesystem';

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
export type LiteralValue =
  | number
  | string
  | boolean
  | { [K: string]: LiteralValue }
  | Array<LiteralValue>;
export const toLiteral = (value: LiteralValue): Literal => ({
  type: 'literal',
  value,
});
export type Literal = {
  type: 'literal';
  value: LiteralValue;
};

export type FilterVariable = {
  name: keyof VariableMap;
  type: TType;
  icon: ReactElement;
};

export const variableDefineMap = {
  Created: {
    type: tDate.create(),
    icon: <DateTimeIcon />,
  },
  Updated: {
    type: tDate.create(),
    icon: <DateTimeIcon />,
  },
  'Is Favourited': {
    type: tBoolean.create(),
    icon: <FavoritedIcon />,
  },
  // Imported: {
  //   type: tBoolean.create(),
  // },
  // 'Daily Note': {
  //   type: tBoolean.create(),
  // },
} as const;
export type VariableMap = {
  [K in keyof typeof variableDefineMap]: LiteralValue;
};
export type View = {
  id: string;
  name: string;
  filterList: Filter[];
};
