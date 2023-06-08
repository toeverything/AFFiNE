import type { Literal, LiteralValue, VariableMap } from '@affine/env/filter';
import { DateTimeIcon, FavoritedIcon } from '@blocksuite/icons';

import { tBoolean, tDate } from './logical/custom-type';
import type { TType } from './logical/typesystem';

export const toLiteral = (value: LiteralValue): Literal => ({
  type: 'literal',
  value,
});

export type FilterVariable = {
  name: keyof VariableMap;
  type: TType;
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

export type InternalVariableMap = {
  [K in keyof typeof variableDefineMap]: LiteralValue;
};

declare module '@affine/env/filter' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface VariableMap extends InternalVariableMap {}
}
