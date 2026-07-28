import type { AdminWorkspaceSort } from '@affine/graphql';
import type { ColumnDef, PaginationState } from '@tanstack/react-table';
import type { Dispatch, SetStateAction } from 'react';

import { SharedDataTable } from '../../../components/shared/data-table';
import type { WorkspaceFlagFilter } from '../schema';
import { DataTableToolbar } from './data-table-toolbar';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pagination: PaginationState;
  workspacesCount: number;
  keyword: string;
  onKeywordChange: (value: string) => void;
  flags: WorkspaceFlagFilter;
  onFlagsChange: Dispatch<SetStateAction<WorkspaceFlagFilter>>;
  sort: AdminWorkspaceSort | undefined;
  onSortChange: (sort: AdminWorkspaceSort | undefined) => void;
  loading?: boolean;
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
  workspacesCount,
  keyword,
  onKeywordChange,
  flags,
  onFlagsChange,
  sort,
  onSortChange,
  onPaginationChange,
  loading = false,
}: DataTableProps<TData, TValue>) {
  return (
    <SharedDataTable
      columns={columns}
      data={data}
      totalCount={workspacesCount}
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      resetFiltersDeps={[keyword, sort, flags]}
      renderToolbar={table => (
        <DataTableToolbar
          table={table}
          keyword={keyword}
          onKeywordChange={onKeywordChange}
          flags={flags}
          onFlagsChange={onFlagsChange}
          sort={sort}
          onSortChange={onSortChange}
          disabled={loading}
        />
      )}
      loading={loading}
      disablePagination={loading}
    />
  );
}
