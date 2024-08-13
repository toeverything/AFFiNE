import { Separator } from '@affine/admin/components/ui/separator';
import { useQuery } from '@affine/core/hooks/use-query';
import { listUsersQuery } from '@affine/graphql';
import { useState } from 'react';

import { Layout } from '../layout';
import { columns } from './components/columns';
import { DataTable } from './components/data-table';

export function Accounts() {
  return <Layout content={<AccountPage />} />;
}

export function AccountPage() {
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

  return (
    <div className=" h-screen flex-1 flex-col flex">
      <div className="flex items-center justify-between px-6 py-3  max-md:ml-9 max-md:mt-[2px]">
        <div className="text-base font-medium">Accounts</div>
      </div>
      <Separator />

      <DataTable
        data={users}
        columns={columns}
        pagination={pagination}
        onPaginationChange={setPagination}
      />
    </div>
  );
}
export { Accounts as Component };
