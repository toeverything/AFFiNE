import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@affine/admin/components/ui/table';
import type {
  ColumnDef,
  ColumnFiltersState,
  PaginationState,
} from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

import type { UserType } from '../schema';
import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar } from './data-table-toolbar';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pagination: PaginationState;
  usersCount: number;
  selectedUsers: UserType[];
  setMemoUsers: Dispatch<SetStateAction<UserType[]>>;
  onPaginationChange: Dispatch<
    SetStateAction<{
      pageIndex: number;
      pageSize: number;
    }>
  >;
}

export function DataTable<TData extends { id: string }, TValue>({
  columns,
  data,
  pagination,
  usersCount,
  selectedUsers,
  setMemoUsers,
  onPaginationChange,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const [tableData, setTableData] = useState(data);
  const [rowCount, setRowCount] = useState(usersCount);
  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: row => row.id,
    manualPagination: true,
    rowCount: rowCount,
    enableFilters: true,
    onPaginationChange: onPaginationChange,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    state: {
      pagination,
      rowSelection,
      columnFilters,
    },
  });

  useEffect(() => {
    setTableData(data);
  }, [data]);

  useEffect(() => {
    setRowCount(usersCount);
  }, [usersCount]);

  return (
    <div className="flex flex-col gap-4 py-5 px-6 h-full overflow-auto">
      <DataTableToolbar
        setDataTable={setTableData}
        data={data}
        usersCount={usersCount}
        table={table}
        selectedUsers={selectedUsers}
        setRowCount={setRowCount}
        setMemoUsers={setMemoUsers}
      />
      <div className="rounded-md border h-full flex flex-col overflow-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className="flex items-center">
                {headerGroup.headers.map(header => {
                  let columnClassName = '';
                  if (header.id === 'select') {
                    columnClassName = 'w-[40px] flex-shrink-0';
                  } else if (header.id === 'info') {
                    columnClassName = 'flex-1';
                  } else if (header.id === 'property') {
                    columnClassName = 'flex-1';
                  } else if (header.id === 'actions') {
                    columnClassName =
                      'w-[40px] flex-shrink-0 justify-center mr-6';
                  }

                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={`${columnClassName} py-2 text-xs flex items-center h-9`}
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
                  <TableRow key={row.id} className="flex items-center">
                    {row.getVisibleCells().map(cell => {
                      let columnClassName = '';
                      if (cell.column.id === 'select') {
                        columnClassName = 'w-[40px] flex-shrink-0';
                      } else if (cell.column.id === 'info') {
                        columnClassName = 'flex-1';
                      } else if (cell.column.id === 'property') {
                        columnClassName = 'flex-1';
                      } else if (cell.column.id === 'actions') {
                        columnClassName =
                          'w-[40px] flex-shrink-0 justify-center mr-6';
                      }

                      return (
                        <TableCell
                          key={cell.id}
                          className={`${columnClassName} flex items-center`}
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
                    className="h-24 text-center"
                  >
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <DataTablePagination table={table} />
    </div>
  );
}
