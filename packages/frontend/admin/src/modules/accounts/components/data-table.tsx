import type { FeatureType } from '@affine/graphql';
import type {
  ColumnDef,
  PaginationState,
  RowSelectionState,
} from '@tanstack/react-table';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

import { SharedDataTable } from '../../../components/shared/data-table';
import type { UserType } from '../schema';
import { DataTableToolbar } from './data-table-toolbar';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  pagination: PaginationState;
  usersCount: number;
  selectedUsers: UserType[];
  keyword: string;
  onKeywordChange: Dispatch<SetStateAction<string>>;
  selectedFeatures: FeatureType[];
  onFeaturesChange: Dispatch<SetStateAction<FeatureType[]>>;
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
  keyword,
  onKeywordChange,
  selectedFeatures,
  onFeaturesChange,
  onPaginationChange,
}: DataTableProps<TData, TValue>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  useEffect(() => {
    setRowSelection({});
  }, [keyword, selectedFeatures]);

  useEffect(() => {
    const selection: Record<string, boolean> = {};
    selectedUsers.forEach(user => {
      selection[user.id] = true;
    });
    setRowSelection(selection);
  }, [selectedUsers]);

  return (
    <SharedDataTable
      columns={columns}
      data={data}
      totalCount={usersCount}
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      rowSelection={rowSelection}
      onRowSelectionChange={setRowSelection}
      resetFiltersDeps={[keyword, selectedFeatures]}
      renderToolbar={table => (
        <DataTableToolbar
          table={table}
          selectedUsers={selectedUsers}
          keyword={keyword}
          onKeywordChange={onKeywordChange}
          selectedFeatures={selectedFeatures}
          onFeaturesChange={onFeaturesChange}
        />
      )}
    />
  );
}
