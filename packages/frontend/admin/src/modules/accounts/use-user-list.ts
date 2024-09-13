import { useQuery } from '@affine/core/components/hooks/use-query';
import { listUsersQuery } from '@affine/graphql';
import { useState } from 'react';

export const useUserList = () => {
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const {
    data: { users },
  } = useQuery({
    query: listUsersQuery,
    variables: {
      filter: {
        first: pagination.pageSize,
        skip: pagination.pageIndex * pagination.pageSize,
      },
    },
  });

  return {
    users,
    pagination,
    setPagination,
  };
};
