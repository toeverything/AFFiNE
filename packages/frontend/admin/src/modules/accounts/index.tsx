import { useEffect, useMemo, useState } from 'react';

import { Header } from '../header';
import { useColumns } from './components/columns';
import { DataTable } from './components/data-table';
import type { UserType } from './schema';
import { useUserList } from './use-user-list';

export function AccountPage() {
  const { users, pagination, setPagination, usersCount } = useUserList();
  // Remember the user temporarily, because userList is paginated on the server side,can't get all users at once.
  const [memoUsers, setMemoUsers] = useState<UserType[]>([]);

  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(
    new Set<string>()
  );
  const columns = useColumns({ setSelectedUserIds });

  useEffect(() => {
    setMemoUsers(prev => [...new Set([...prev, ...users])]);
  }, [users]);

  const selectedUsers = useMemo(() => {
    return memoUsers.filter(user => selectedUserIds.has(user.id));
  }, [selectedUserIds, memoUsers]);

  return (
    <div className=" h-screen flex-1 flex-col flex">
      <Header title="Accounts" />

      <DataTable
        data={users}
        columns={columns}
        pagination={pagination}
        usersCount={usersCount}
        onPaginationChange={setPagination}
        selectedUsers={selectedUsers}
        setMemoUsers={setMemoUsers}
      />
    </div>
  );
}
export { AccountPage as Component };
