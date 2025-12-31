import { useQuery } from '@affine/admin/use-query';
import {
  adminWorkspacesCountQuery,
  AdminWorkspaceSort,
  adminWorkspacesQuery,
  FeatureType,
} from '@affine/graphql';
import { useEffect, useMemo, useState } from 'react';

export const useWorkspaceList = (filter?: {
  keyword?: string;
  features?: FeatureType[];
  orderBy?: AdminWorkspaceSort;
}) => {
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const filterKey = useMemo(
    () =>
      `${filter?.keyword ?? ''}-${[...(filter?.features ?? [])]
        .sort()
        .join(',')}-${filter?.orderBy ?? ''}`,
    [filter?.features, filter?.keyword, filter?.orderBy]
  );

  useEffect(() => {
    setPagination(prev => ({ ...prev, pageIndex: 0 }));
  }, [filterKey]);

  const variables = useMemo(
    () => ({
      filter: {
        first: pagination.pageSize,
        skip: pagination.pageIndex * pagination.pageSize,
        keyword: filter?.keyword || undefined,
        features:
          filter?.features && filter.features.length > 0
            ? filter.features
            : undefined,
        orderBy: filter?.orderBy,
      },
    }),
    [
      filter?.features,
      filter?.keyword,
      filter?.orderBy,
      pagination.pageIndex,
      pagination.pageSize,
    ]
  );

  const { data: listData, isValidating: isListValidating } = useQuery(
    {
      query: adminWorkspacesQuery,
      variables,
    },
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateIfStale: true,
      revalidateOnReconnect: true,
    }
  );

  const { data: countData, isValidating: isCountValidating } = useQuery(
    {
      query: adminWorkspacesCountQuery,
      variables,
    },
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateIfStale: true,
      revalidateOnReconnect: true,
    }
  );

  const loading =
    isListValidating ||
    isCountValidating ||
    listData === undefined ||
    countData === undefined;

  return {
    workspaces: listData?.adminWorkspaces ?? [],
    workspacesCount: countData?.adminWorkspacesCount ?? 0,
    pagination,
    setPagination,
    loading,
  };
};
