import { ScrollArea } from '@affine/admin/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@affine/admin/components/ui/table';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar } from './data-table-toolbar';
import { useUserCount } from './use-user-management';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pagination: PaginationState;
  onPaginationChange: Dispatch<
    SetStateAction<{
      pageIndex: number;
      pageSize: number;
    }>
  >;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  pagination,
  onPaginationChange,
}: DataTableProps<TData, TValue>) {
  const usersCount = useUserCount();

  const [tableData, setTableData] = useState(data);
  const table = useReactTable({
    data: tableData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    rowCount: usersCount,
    enableFilters: true,
    onPaginationChange: onPaginationChange,
    state: {
      pagination,
    },
  });

  useEffect(() => {
    setTableData(data);
  }, [data]);

  return (
    <div className="flex flex-col gap-4 py-5 px-6 h-full">
      <DataTableToolbar setDataTable={setTableData} data={data} />
      <ScrollArea className="rounded-md border max-h-[75vh] h-full">
        <Table>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map(row => (
                <TableRow
                  key={row.id}
                  className="flex items-center justify-between"
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
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
      </ScrollArea>

      <DataTablePagination table={table} />
    </div>
  );
}
