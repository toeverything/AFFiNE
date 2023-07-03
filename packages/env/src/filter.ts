export type LiteralValue =
  | number
  | string
  | boolean
  | { [K: string]: LiteralValue }
  | Array<LiteralValue>;

export type Ref = {
  type: 'ref';
  name: keyof VariableMap;
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface VariableMap {}

export type Literal = {
  type: 'literal';
  value: LiteralValue;
};

export type Filter = {
  type: 'filter';
  left: Ref;
  funcName: string;
  args: Literal[];
};

export type Collection = {
  id: string;
  name: string;
  pinned?: boolean;
  filterList: Filter[];
  allowList?: string[];
  excludeList?: string[];
};
