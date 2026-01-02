import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@affine/admin/components/ui/avatar';
import { AccountIcon, LinkIcon } from '@blocksuite/icons/rc';
import type { ColumnDef } from '@tanstack/react-table';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useMemo } from 'react';

import type { WorkspaceListItem } from '../schema';
import { formatBytes } from '../utils';
import { DataTableRowActions } from './data-table-row-actions';

export const useColumns = () => {
  const columns: ColumnDef<WorkspaceListItem>[] = useMemo(() => {
    return [
      {
        accessorKey: 'workspace',
        header: () => <div className="text-xs font-medium">Workspace</div>,
        cell: ({ row }) => {
          const workspace = row.original;
          return (
            <div className="flex flex-col gap-1 max-w-[40vw] min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 text-sm font-medium overflow-hidden">
                <span className="truncate">
                  {workspace.name || workspace.id}
                </span>
                {workspace.public ? (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border"
                    style={{
                      backgroundColor: cssVarV2('chip/label/white'),
                      borderColor: cssVarV2('layer/insideBorder/border'),
                    }}
                  >
                    <LinkIcon fontSize={14} />
                    Public
                  </span>
                ) : null}
              </div>
              <div
                className="text-xs font-mono truncate w-full"
                style={{ color: cssVarV2('text/secondary') }}
              >
                {workspace.id}
              </div>
              <div className="flex flex-wrap gap-2 text-[11px]">
                {workspace.features.length ? (
                  workspace.features.map(feature => (
                    <span
                      key={feature}
                      className="px-2 py-0.5 rounded border"
                      style={{
                        backgroundColor: cssVarV2('chip/label/white'),
                        borderColor: cssVarV2('layer/insideBorder/border'),
                      }}
                    >
                      {feature}
                    </span>
                  ))
                ) : (
                  <span style={{ color: cssVarV2('text/secondary') }}>
                    No features
                  </span>
                )}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'owner',
        header: () => <div className="text-xs font-medium">Owner</div>,
        cell: ({ row }) => {
          const owner = row.original.owner;
          if (!owner) {
            return (
              <div
                className="text-xs"
                style={{ color: cssVarV2('text/secondary') }}
              >
                Unknown
              </div>
            );
          }
          return (
            <div className="flex items-center gap-3 min-w-[180px] min-w-0">
              <Avatar className="w-9 h-9">
                <AvatarImage src={owner.avatarUrl ?? undefined} />
                <AvatarFallback>
                  <AccountIcon fontSize={16} />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col overflow-hidden min-w-0">
                <div className="text-sm font-medium truncate">{owner.name}</div>
                <div
                  className="text-xs truncate"
                  style={{ color: cssVarV2('text/secondary') }}
                >
                  {owner.email}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'usage',
        header: () => <div className="text-xs font-medium">Usage</div>,
        cell: ({ row }) => {
          const ws = row.original;
          return (
            <div className="flex flex-col gap-1 text-xs">
              <div className="flex gap-3">
                <span>Snapshot {formatBytes(ws.snapshotSize)}</span>
                <span style={{ color: cssVarV2('text/secondary') }}>
                  ({ws.snapshotCount})
                </span>
              </div>
              <div className="flex gap-3">
                <span>Blobs {formatBytes(ws.blobSize)}</span>
                <span style={{ color: cssVarV2('text/secondary') }}>
                  ({ws.blobCount})
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'members',
        header: () => <div className="text-xs font-medium">Members</div>,
        cell: ({ row }) => {
          const ws = row.original;
          return (
            <div className="flex flex-col text-xs gap-1">
              <div className="flex gap-2">
                <span className="font-medium">{ws.memberCount}</span>
                <span style={{ color: cssVarV2('text/secondary') }}>
                  members
                </span>
              </div>
              <div className="flex gap-2">
                <span className="font-medium">{ws.publicPageCount}</span>
                <span style={{ color: cssVarV2('text/secondary') }}>
                  shared pages
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'actions',
        meta: {
          className: 'w-[190px] justify-end',
        },
        header: () => (
          <div className="text-xs font-medium text-right">Actions</div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-end w-full">
            <DataTableRowActions workspace={row.original} />
          </div>
        ),
      },
    ];
  }, []);

  return columns;
};
