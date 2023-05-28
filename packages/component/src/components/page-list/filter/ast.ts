import type { VariableMap } from './vars';

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
