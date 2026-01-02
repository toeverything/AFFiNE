import { AdminWorkspaceSort, FeatureType } from '@affine/graphql';
import { useState } from 'react';

import { Header } from '../header';
import { useColumns } from './components/columns';
import { DataTable } from './components/data-table';
import type { WorkspaceFlagFilter } from './schema';
import { useWorkspaceList } from './use-workspace-list';

export function WorkspacePage() {
  const [keyword, setKeyword] = useState('');
  const [featureFilters, setFeatureFilters] = useState<FeatureType[]>([]);
  const [flagFilters, setFlagFilters] = useState<WorkspaceFlagFilter>({});
  const [sort, setSort] = useState<AdminWorkspaceSort | undefined>(
    AdminWorkspaceSort.CreatedAt
  );

  const { workspaces, pagination, setPagination, workspacesCount, loading } =
    useWorkspaceList({
      keyword,
      features: featureFilters,
      orderBy: sort,
      flags: flagFilters,
    });

  const columns = useColumns();

  return (
    <div className="h-screen flex-1 flex-col flex">
      <Header title="Workspaces" />

      <DataTable
        data={workspaces}
        columns={columns}
        pagination={pagination}
        workspacesCount={workspacesCount}
        onPaginationChange={setPagination}
        keyword={keyword}
        onKeywordChange={setKeyword}
        selectedFeatures={featureFilters}
        onFeaturesChange={setFeatureFilters}
        flags={flagFilters}
        onFlagsChange={setFlagFilters}
        sort={sort}
        onSortChange={setSort}
        loading={loading}
      />
    </div>
  );
}

export { WorkspacePage as Component };
