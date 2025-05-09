export type ColumnType = string;

export interface Column<
  Data extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  type: ColumnType;
  name: string;
  data: Data;
}

export type StatCalcOpType = string | undefined;
