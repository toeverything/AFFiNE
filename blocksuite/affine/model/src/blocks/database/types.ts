export interface ColumnDataType<
  Data extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  type: string;
  name: string;
  data: Data;
}

export type ColumnUpdater<T extends ColumnDataType = ColumnDataType> = (
  data: T
) => Partial<T>;
export type CellDataType<ValueType = unknown> = {
  columnId: ColumnDataType['id'];
  value: ValueType;
};

export type SerializedCells = Record<string, Record<string, CellDataType>>;
export type ViewBasicDataType = {
  id: string;
  name: string;
  mode: string;
};
