import { z } from 'zod';

export const TableViewTypeSchema = z.object({
  viewId: z.string(),
  type: z.literal('table'),
});
export const RangeSchema = z.object({
  start: z.number(),
  end: z.number(),
});
export const FocusSchema = z.object({
  rowIndex: z.number(),
  columnIndex: z.number(),
});
export const TableViewAreaSelectionSchema = z.object({
  selectionType: z.literal('area'),
  groupKey: z.string().optional(),
  rowsSelection: RangeSchema,
  columnsSelection: RangeSchema,
  focus: FocusSchema,
  isEditing: z.boolean(),
});

export const RowWithGroupSchema = z.object({
  id: z.string(),
  groupKey: z.string().optional(),
});

export const TableViewRowSelectionSchema = z.object({
  selectionType: z.literal('row'),
  rows: z.array(RowWithGroupSchema),
});

export const TableViewSelectionSchema = z.union([
  TableViewAreaSelectionSchema,
  TableViewRowSelectionSchema,
]);
export const TableViewSelectionWithTypeSchema = z.union([
  z.intersection(TableViewTypeSchema, TableViewAreaSelectionSchema),
  z.intersection(TableViewTypeSchema, TableViewRowSelectionSchema),
]);
export type RowWithGroup = z.TypeOf<typeof RowWithGroupSchema>;
export const RowWithGroup = {
  equal(a?: RowWithGroup, b?: RowWithGroup) {
    if (a == null || b == null) {
      return false;
    }
    return a.id === b.id && a.groupKey === b.groupKey;
  },
};
export type TableViewRowSelection = z.TypeOf<
  typeof TableViewRowSelectionSchema
>;
export const TableViewRowSelection = {
  rows: (selection?: TableViewSelection): RowWithGroup[] => {
    if (selection?.selectionType === 'row') {
      return selection.rows;
    }
    return [];
  },
  rowsIds: (selection?: TableViewSelection): string[] => {
    return TableViewRowSelection.rows(selection).map(v => v.id);
  },
  includes(
    selection: TableViewSelection | undefined,
    row: RowWithGroup
  ): boolean {
    if (!selection) {
      return false;
    }
    return TableViewRowSelection.rows(selection).some(v =>
      RowWithGroup.equal(v, row)
    );
  },
  create(options: { rows: RowWithGroup[] }): TableViewRowSelection {
    return {
      selectionType: 'row',
      rows: options.rows,
    };
  },
  is(selection?: TableViewSelection): selection is TableViewRowSelection {
    return selection?.selectionType === 'row';
  },
};
export type TableViewAreaSelection = z.TypeOf<
  typeof TableViewAreaSelectionSchema
>;
export const TableViewAreaSelection = {
  create: (options: {
    groupKey?: string;
    focus: CellFocus;
    rowsSelection?: MultiSelection;
    columnsSelection?: MultiSelection;
    isEditing: boolean;
  }): TableViewAreaSelection => {
    return {
      ...options,
      selectionType: 'area',
      rowsSelection: options.rowsSelection ?? {
        start: options.focus.rowIndex,
        end: options.focus.rowIndex,
      },
      columnsSelection: options.columnsSelection ?? {
        start: options.focus.columnIndex,
        end: options.focus.columnIndex,
      },
    };
  },
  isFocus(selection: TableViewAreaSelection) {
    return (
      selection.focus.rowIndex === selection.rowsSelection.start &&
      selection.focus.rowIndex === selection.rowsSelection.end &&
      selection.focus.columnIndex === selection.columnsSelection.start &&
      selection.focus.columnIndex === selection.columnsSelection.end
    );
  },
};
export type CellFocus = z.TypeOf<typeof FocusSchema>;
export type MultiSelection = z.TypeOf<typeof RangeSchema>;
export type TableViewSelection = z.TypeOf<typeof TableViewSelectionSchema>;
export type TableViewSelectionWithType = z.TypeOf<
  typeof TableViewSelectionWithTypeSchema
>;
