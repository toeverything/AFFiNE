import { Button } from '@affine/admin/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@affine/admin/components/ui/select';
import type { Table } from '@tanstack/react-table';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from 'lucide-react';
import { useCallback, useTransition } from 'react';

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  const [, startTransition] = useTransition();

  // to handle the error: a component suspended while responding to synchronous input.
  // This will cause the UI to be replaced with a loading indicator.
  // To fix, updates that suspend should be wrapped with startTransition.
  const onPageSizeChange = useCallback(
    (value: string) => {
      startTransition(() => {
        table.setPageSize(Number(value));
      });
    },
    [table]
  );
  const handleFirstPage = useCallback(() => {
    startTransition(() => {
      table.setPageIndex(0);
    });
  }, [startTransition, table]);
  const handlePreviousPage = useCallback(() => {
    startTransition(() => {
      table.previousPage();
    });
  }, [startTransition, table]);
  const handleNextPage = useCallback(() => {
    startTransition(() => {
      table.nextPage();
    });
  }, [startTransition, table]);
  const handleLastPage = useCallback(() => {
    startTransition(() => {
      table.setPageIndex(table.getPageCount() - 1);
    });
  }, [startTransition, table]);

  return (
    <div className="flex items-center justify-between md:px-2">
      <div className="flex items-center md:space-x-2">
        <p className="text-sm font-medium max-md:hidden">Rows per page</p>
        <Select
          value={`${table.getState().pagination.pageSize}`}
          onValueChange={onPageSizeChange}
        >
          <SelectTrigger className="h-8 w-[70px]">
            <SelectValue placeholder={table.getState().pagination.pageSize} />
          </SelectTrigger>
          <SelectContent side="top">
            {[10, 20, 40, 80].map(pageSize => (
              <SelectItem key={pageSize} value={`${pageSize}`}>
                {pageSize}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {table.getPageCount()}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={handleFirstPage}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to first page</span>
            <ChevronsLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={handlePreviousPage}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={handleNextPage}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="hidden h-8 w-8 p-0 lg:flex"
            onClick={handleLastPage}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to last page</span>
            <ChevronsRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
