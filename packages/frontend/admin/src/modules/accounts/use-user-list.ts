import { useQuery } from '@affine/admin/use-query';
import { listUsersQuery } from '@affine/graphql';
import { useState } from 'react';

export const useUserList = () => {
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const {
    data: { users, usersCount },
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
    usersCount,
  };
};
