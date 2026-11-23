import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@affine/admin/components/ui/avatar';
import { cn } from '@affine/admin/utils';
import { FeatureType } from '@affine/graphql';
import {
  AccountIcon,
  EmailIcon,
  EmailWarningIcon,
  LockIcon,
  UnlockIcon,
} from '@blocksuite/icons/rc';
import type { ColumnDef } from '@tanstack/react-table';
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useMemo,
} from 'react';

import { Checkbox } from '../../../components/ui/checkbox';
import type { UserType } from '../schema';
import { DataTableColumnHeader } from './data-table-column-header';
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
    className={cn(
      'flex items-center gap-1',
      condition ? 'text-muted-foreground' : 'text-destructive'
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
export const useColumns = ({
  setSelectedUserIds,
}: {
  setSelectedUserIds: Dispatch<SetStateAction<Set<string>>>;
}) => {
  const columns: ColumnDef<UserType>[] = useMemo(() => {
    return [
      {
        id: 'select',
        meta: {
          className: 'w-[40px] flex-shrink-0',
        },
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && 'indeterminate')
            }
            onCheckedChange={value => {
              if (value) {
                setSelectedUserIds(
                  prev =>
                    new Set([
                      ...prev,
                      ...table
                        .getFilteredRowModel()
                        .rows.map(row => row.original.id),
                    ])
                );
              } else {
                // remove selected users in the current page
                setSelectedUserIds(
                  prev =>
                    new Set(
                      [...prev].filter(
                        id =>
                          !table
                            .getFilteredRowModel()
                            .rows.some(row => row.original.id === id)
                      )
                    )
                );
              }

              table.toggleAllPageRowsSelected(!!value);
            }}
            aria-label="Select all"
            className="translate-y-[2px]"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={value => {
              if (value) {
                setSelectedUserIds(prev => new Set([...prev, row.original.id]));
              } else {
                setSelectedUserIds(
                  prev =>
                    new Set([...prev].filter(id => id !== row.original.id))
                );
              }
              row.toggleSelected(!!value);
            }}
            aria-label="Select row"
            className="translate-y-[2px]"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'info',
        meta: {
          className: 'w-[250px] flex-shrink-0',
        },
        header: ({ column }) => (
          <DataTableColumnHeader
            className="text-xs"
            column={column}
            title="Name"
          />
        ),
        cell: ({ row }) => (
          <div className="flex gap-4 items-center max-w-[50vw] overflow-hidden">
            <Avatar className="w-10 h-10">
              <AvatarImage src={row.original.avatarUrl ?? undefined} />
              <AvatarFallback>
                <AccountIcon fontSize={20} />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1 max-w-full overflow-hidden">
              <div className="text-sm font-medium max-w-full overflow-hidden gap-[6px]">
                <span>{row.original.name}</span>
                {row.original.features.includes(FeatureType.Admin) && (
                  <span className="ml-2 inline-flex h-5 items-center rounded-md border border-border/60 bg-chip-blue px-2 py-0.5 text-xxs font-medium text-chip-text">
                    Admin
                  </span>
                )}
                {row.original.disabled && (
                  <span className="ml-2 inline-flex h-5 items-center rounded-md border border-border/60 bg-chip-white px-2 py-0.5 text-xxs font-medium">
                    Disabled
                  </span>
                )}
              </div>
              <div className="max-w-full overflow-hidden text-xs font-medium text-muted-foreground">
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
        header: ({ column }) => (
          <DataTableColumnHeader
            className="text-xs max-md:hidden"
            column={column}
            title="User Detail"
          />
        ),
        cell: ({ row: { original: user } }) => (
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-2 text-xs max-md:hidden">
              <div className="flex justify-start">{user.id}</div>
              <div className="flex gap-3 items-center justify-start">
                <StatusItem
                  condition={user.hasPassword}
                  IconTrue={
                    <LockIcon fontSize={16} className="text-muted-foreground" />
                  }
                  IconFalse={
                    <UnlockIcon fontSize={16} className="text-destructive" />
                  }
                  textTrue="Password Set"
                  textFalse="No Password"
                />
                <StatusItem
                  condition={user.emailVerified}
                  IconTrue={
                    <EmailIcon
                      fontSize={16}
                      className="text-muted-foreground"
                    />
                  }
                  IconFalse={
                    <EmailWarningIcon
                      fontSize={16}
                      className="text-destructive"
                    />
                  }
                  textTrue="Email Verified"
                  textFalse="Email Not Verified"
                />
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {user.features.length ? (
                  user.features.map(feature => (
                    <span
                      key={feature}
                      className="inline-flex h-5 items-center rounded-md border border-border/60 bg-chip-white px-2 py-0.5 text-xxs font-medium"
                    >
                      {feature}
                    </span>
                  ))
                ) : (
                  <span className="text-muted-foreground">No features</span>
                )}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'actions',
        meta: {
          className: 'w-[80px]',
        },
        header: ({ column }) => (
          <DataTableColumnHeader
            className="text-xs"
            column={column}
            title="Actions"
          />
        ),
        cell: ({ row: { original: user } }) => (
          <DataTableRowActions user={user} />
        ),
      },
    ];
  }, [setSelectedUserIds]);
  return columns;
};
