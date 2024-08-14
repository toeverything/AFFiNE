import { Separator } from '@affine/admin/components/ui/separator';

import { columns } from './components/columns';
import { DataTable } from './components/data-table';
import { useUserList } from './use-user-list';

export function AccountPage() {
  const { users, pagination, setPagination } = useUserList();

  return (
    <div className=" h-screen flex-1 flex-col flex">
      <div className="flex items-center justify-between px-6 py-3  my-[2px]  max-md:ml-9 max-md:mt-[2px]">
        <div className="text-base font-medium">Accounts</div>
      </div>
      <Separator />

      <DataTable
        data={users}
        // @ts-expect-error do not complains
        columns={columns}
        pagination={pagination}
        onPaginationChange={setPagination}
      />
    </div>
  );
}
export { AccountPage as Component };
