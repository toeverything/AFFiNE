import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@affine/admin/components/ui/table';
import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type Table as TableInstance,
  useReactTable,
} from '@tanstack/react-table';
import { type ReactNode, useEffect, useState } from 'react';

import { DataTablePagination } from './data-table-pagination';

const DEFAULT_RESET_FILTERS_DEPS: unknown[] = [];

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  totalCount: number;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  loading?: boolean;
  disablePagination?: boolean;

  // Row Selection
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  // Toolbar
  renderToolbar?: (table: TableInstance<TData>) => ReactNode;

  // External State Sync (for filters etc to reset internal state if needed)
  // In the original code, columnFilters was reset when keyword/features changed.
  // We can expose onColumnFiltersChange or just handle it internally if we don't need to lift it.
  // The original code reset columnFilters on keyword change.
  // We can pass a dependency array to reset column filters?
  // Or just let the parent handle it if they want to control column filters.
  // For now, let's keep columnFilters internal but allow resetting.
  resetFiltersDeps?: any[];
}

export function SharedDataTable<TData extends { id: string }, TValue>({
  columns,
  data,
  totalCount,
  pagination,
  onPaginationChange,
  loading = false,
  disablePagination = false,
  rowSelection,
  onRowSelectionChange,
  renderToolbar,
  resetFiltersDeps = DEFAULT_RESET_FILTERS_DEPS,
}: DataTableProps<TData, TValue>) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  useEffect(() => {
    setColumnFilters([]);
  }, [resetFiltersDeps]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: row => row.id,
    manualPagination: true,
    rowCount: totalCount,
    enableFilters: true,
    onPaginationChange: onPaginationChange,
    onColumnFiltersChange: setColumnFilters,
    // Row Selection
    enableRowSelection: !!onRowSelectionChange,
    onRowSelectionChange: onRowSelectionChange,
    state: {
      pagination,
      columnFilters,
      rowSelection: rowSelection ?? {},
    },
  });

  return (
    <div className="relative flex h-full flex-col gap-4 overflow-auto px-6 py-5">
      {renderToolbar?.(table)}
      <div className="relative flex h-full flex-col overflow-auto rounded-xl border border-border/60 bg-card shadow-1">
        {loading ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-background/75 text-sm text-muted-foreground backdrop-blur-[1px]">
            <svg
              className="h-5 w-5 animate-spin text-primary"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            <span>Loading...</span>
          </div>
        ) : null}
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow
                key={headerGroup.id}
                className="flex items-center bg-muted/40"
              >
                {headerGroup.headers.map(header => {
                  // Use meta.className if available, otherwise default to flex-1
                  const meta = header.column.columnDef.meta as
                    | { className?: string }
                    | undefined;
                  const className = meta?.className ?? 'flex-1 min-w-0';

                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={`${className} py-2 text-xs flex items-center h-9`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
        </Table>
        <div className="overflow-auto flex-1">
          <Table>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map(row => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className="flex items-center bg-card"
                  >
                    {row.getVisibleCells().map(cell => {
                      const meta = cell.column.columnDef.meta as
                        | { className?: string }
                        | undefined;
                      const className = meta?.className ?? 'flex-1 min-w-0';

                      return (
                        <TableCell
                          key={cell.id}
                          className={`${className} py-2`}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center flex-1"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <DataTablePagination
        table={table}
        disabled={disablePagination || loading}
      />
    </div>
  );
}
