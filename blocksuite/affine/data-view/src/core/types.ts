import type {
  KanbanViewSelectionWithType,
  TableViewSelectionWithType,
} from '../view-presets';

export type DataViewSelection =
  | TableViewSelectionWithType
  | KanbanViewSelectionWithType;
export type DataViewSelectionState = DataViewSelection | undefined;
export type PropertyDataUpdater<
  Data extends Record<string, unknown> = Record<string, unknown>,
> = (data: Data) => Partial<Data>;

export interface DatabaseFlags {
  enable_table_virtual_scroll: boolean;
}
