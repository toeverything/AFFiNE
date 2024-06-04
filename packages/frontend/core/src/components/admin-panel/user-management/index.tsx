import { Tooltip } from '@affine/component';
import type { PaginationProps } from '@affine/component/member-components';
import { Pagination } from '@affine/component/member-components';
import { Avatar } from '@affine/component/ui/avatar';
import { AffineErrorBoundary } from '@affine/core/components/affine/affine-error-boundary';
import type { ReactElement } from 'react';
import {
  Suspense,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { useGetUserList } from '../hooks';
import * as styles from './index.css';
const COUNT_PER_PAGE = 8;

export const UsersPanel = () => {
  const [userSkip, setUserSkip] = useState(0);

  const onPageChange = useCallback<PaginationProps['onPageChange']>(offset => {
    setUserSkip(offset);
  }, []);

  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const [userListHeight, setUserListHeight] = useState<number | null>(null);
  const userCount = 20;
  useLayoutEffect(() => {
    if (
      userCount > COUNT_PER_PAGE &&
      listContainerRef.current &&
      userListHeight === null
    ) {
      const rect = listContainerRef.current.getBoundingClientRect();
      setUserListHeight(rect.height);
    }
  }, [listContainerRef, userListHeight]);

  return (
    <div style={{ maxWidth: '960px', padding: '16px', justifySelf: 'center' }}>
      <h1>User List</h1>

      <div
        ref={listContainerRef}
        style={userListHeight ? { height: userListHeight } : {}}
      >
        <Suspense>
          <UserList skip={userSkip} />
        </Suspense>

        {userCount > COUNT_PER_PAGE && (
          <Pagination
            totalCount={userCount}
            countPerPage={COUNT_PER_PAGE}
            onPageChange={onPageChange}
          />
        )}
      </div>
    </div>
  );
};

const UserList = ({ skip }: { skip: number }) => {
  const users = useGetUserList(skip, COUNT_PER_PAGE);

  return <UserTable users={users} />;
};

const UserTable = ({ users }: { users: any[] }) => {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>ID</th>
          <th>Name</th>
          <th>Email</th>
          <th>Email Verified</th>
          <th>Has Password</th>
          <th>Avatar</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {users.map(user => (
          <tr key={user.id}>
            <TableTd>{user.id}</TableTd>
            <TableTd>{user.name}</TableTd>
            <TableTd>{user.email}</TableTd>
            <TableTd>{user.emailVerified ? 'True' : 'False'}</TableTd>
            <TableTd>{user.hasPassword ? 'True' : 'False'}</TableTd>
            <td>
              <Avatar
                size={36}
                url={user.avatarUrl}
                name={(user.name ? user.name : user.email) as string}
              />
            </td>
            <td>
              <button>Remove</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const TableTd = ({ children }: { children: React.ReactNode }) => {
  return (
    <Tooltip content={children}>
      <td>{children}</td>
    </Tooltip>
  );
};

export const UsersListPanel = (): ReactElement | null => {
  return (
    <AffineErrorBoundary>
      <Suspense>
        <UsersPanel />
      </Suspense>
    </AffineErrorBoundary>
  );
};
