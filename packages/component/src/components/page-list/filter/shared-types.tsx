import type {
  Literal,
  LiteralValue,
  PropertiesMeta,
  VariableMap,
} from '@affine/env/filter';
import {
  DateTimeIcon,
  FavoritedIcon,
  MultiSelectIcon,
} from '@blocksuite/icons';
import type { ReactElement } from 'react';

import { tBoolean, tDate, tTag } from './logical/custom-type';
import type { TType } from './logical/typesystem';
import { tArray } from './logical/typesystem';

export const toLiteral = (value: LiteralValue): Literal => ({
  type: 'literal',
  value,
});

export type FilterVariable = {
  name: keyof VariableMap;
  type: (propertiesMeta: PropertiesMeta) => TType;
  icon: ReactElement;
};

export const variableDefineMap = {
  Created: {
    type: () => tDate.create(),
    icon: <DateTimeIcon />,
  },
  Updated: {
    type: () => tDate.create(),
    icon: <DateTimeIcon />,
  },
  'Is Favourited': {
    type: () => tBoolean.create(),
    icon: <FavoritedIcon />,
  },
  Tags: {
    type: meta => tArray(tTag.create({ tags: meta.tags.options })),
    icon: <MultiSelectIcon />,
  },
  // Imported: {
  //   type: tBoolean.create(),
  // },
  // 'Daily Note': {
  //   type: tBoolean.create(),
  // },
} satisfies Record<string, Omit<FilterVariable, 'name'>>;

export type InternalVariableMap = {
  [K in keyof typeof variableDefineMap]: LiteralValue;
};

declare module '@affine/env/filter' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface VariableMap extends InternalVariableMap {}
}
