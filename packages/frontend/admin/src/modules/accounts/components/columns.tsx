import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@affine/admin/components/ui/avatar';
import type { UserType } from '@affine/graphql';
import { FeatureType } from '@affine/graphql';
import type { ColumnDef } from '@tanstack/react-table';
import clsx from 'clsx';
import {
  LockIcon,
  MailIcon,
  MailWarningIcon,
  UnlockIcon,
  UserIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { DataTableRowActions } from './data-table-row-actions';

const StatusItem = ({
  condition,
  IconTrue,
  IconFalse,
  textTrue,
  textFalse,
}: {
  condition: boolean | null;
  IconTrue: ReactNode;
  IconFalse: ReactNode;
  textTrue: string;
  textFalse: string;
}) => (
  <div
    className={clsx(
      'flex gap-2 items-center',
      !condition ? 'text-red-500 opacity-100' : 'opacity-25'
    )}
  >
    {condition ? (
      <>
        {IconTrue}
        {textTrue}
      </>
    ) : (
      <>
        {IconFalse}
        {textFalse}
      </>
    )}
  </div>
);

export const columns: ColumnDef<UserType>[] = [
  {
    accessorKey: 'info',
    cell: ({ row }) => (
      <div className="flex gap-3 items-center max-w-[50vw] overflow-hidden">
        <Avatar className="w-10 h-10">
          <AvatarImage src={row.original.avatarUrl ?? undefined} />
          <AvatarFallback>
            <UserIcon size={20} />
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1 max-w-full overflow-hidden">
          <div className="text-sm font-medium max-w-full overflow-hidden gap-[6px]">
            <span>{row.original.name}</span>{' '}
            {row.original.features.includes(FeatureType.Admin) && (
              <span
                className="rounded p-1 text-xs"
                style={{
                  backgroundColor: 'rgba(30, 150, 235, 0.20)',
                  color: 'rgba(30, 150, 235, 1)',
                }}
              >
                Admin
              </span>
            )}
          </div>
          <div className="text-xs font-medium opacity-50 max-w-full overflow-hidden">
            {row.original.email}
          </div>
        </div>
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'property',
    cell: ({ row: { original: user } }) => (
      <div className="flex items-center gap-2">
        <div className="flex flex-col gap-2 text-xs max-md:hidden">
          <div className="flex justify-end opacity-25">{user.id}</div>
          <div className="flex gap-3 items-center justify-end">
            <StatusItem
              condition={user.hasPassword}
              IconTrue={<LockIcon size={10} />}
              IconFalse={<UnlockIcon size={10} />}
              textTrue="Password Set"
              textFalse="No Password"
            />

            <StatusItem
              condition={user.emailVerified}
              IconTrue={<MailIcon size={10} />}
              IconFalse={<MailWarningIcon size={10} />}
              textTrue="Email Verified"
              textFalse="Email Not Verified"
            />
          </div>
        </div>
        <DataTableRowActions user={user} />
      </div>
    ),
  },
];
