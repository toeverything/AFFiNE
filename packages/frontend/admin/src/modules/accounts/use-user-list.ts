import { useQuery } from '@affine/admin/use-query';
import { FeatureType, listUsersQuery } from '@affine/graphql';
import { useEffect, useMemo, useState } from 'react';

export const useUserList = (filter?: {
  keyword?: string;
  features?: FeatureType[];
}) => {
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const filterKey = useMemo(
    () =>
      `${filter?.keyword ?? ''}-${[...(filter?.features ?? [])]
        .sort()
        .join(',')}`,
    [filter?.features, filter?.keyword]
  );

  useEffect(() => {
    setPagination(prev => ({ ...prev, pageIndex: 0 }));
  }, [filterKey]);

  const {
    data: { users, usersCount },
  } = useQuery(
    {
      query: listUsersQuery,
      variables: {
        filter: {
          first: pagination.pageSize,
          skip: pagination.pageIndex * pagination.pageSize,
          keyword: filter?.keyword || undefined,
          features:
            filter?.features && filter.features.length > 0
              ? filter.features
              : undefined,
        },
      },
    },
    { keepPreviousData: true }
  );

  return {
    users,
    pagination,
    setPagination,
    usersCount,
  };
};
