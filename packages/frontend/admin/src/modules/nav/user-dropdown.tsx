import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@affine/admin/components/ui/avatar';
import { Button } from '@affine/admin/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@affine/admin/components/ui/dropdown-menu';
import { MoreVerticalIcon } from '@blocksuite/icons/rc';
import { CircleUser } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { affineFetch } from '../../fetch-utils';
import { useCurrentUser, useRevalidateCurrentUser } from '../common';

interface UserDropdownProps {
  isCollapsed: boolean;
}

const adminBadgeClass =
  'inline-flex h-5 items-center rounded-md border border-border/60 bg-chip-blue px-2 py-0.5 text-xxs font-medium text-chip-text';

const UserInfo = ({
  name,
  email,
  avatarUrl,
}: {
  email: string;
  avatarUrl: string | null;
  name?: string;
}) => {
  return (
    <>
      <Avatar className="w-8 h-8">
        <AvatarImage src={avatarUrl ?? undefined} />
        <AvatarFallback>
          <CircleUser size={32} />
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col font-medium gap-1">
        {name ?? email.split('@')[0]}
        <span className={adminBadgeClass}>Admin</span>
      </div>
    </>
  );
};

const UserName = ({
  name,
  email,
}: {
  name?: string | null;
  email?: string;
}) => {
  if (name) {
    return (
      <span
        className="max-w-[120px] overflow-hidden text-ellipsis text-sm whitespace-nowrap"
        title={name}
      >
        {name}
      </span>
    );
  }

  const fallback = email?.split('@')[0] ?? '';
  return (
    <span
      className="max-w-[120px] overflow-hidden text-ellipsis text-sm whitespace-nowrap"
      title={fallback}
    >
      {fallback}
    </span>
  );
};

export function UserDropdown({ isCollapsed }: UserDropdownProps) {
  const currentUser = useCurrentUser();
  const relative = useRevalidateCurrentUser();

  const handleLogout = useCallback(() => {
    affineFetch('/api/auth/sign-out', { method: 'POST' })
      .then(() => {
        toast.success('Logged out successfully');
        return relative();
      })
      .catch(err => {
        toast.error(`Failed to logout: ${err.message}`);
      });
  }, [relative]);

  if (isCollapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 w-9 rounded-lg" size="icon">
            <Avatar className="h-5 w-5">
              <AvatarImage src={currentUser?.avatarUrl ?? undefined} />
              <AvatarFallback>
                <CircleUser size={24} />
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right">
          <DropdownMenuLabel className="flex items-center gap-2">
            {currentUser ? (
              <UserInfo
                email={currentUser.email}
                name={currentUser.name}
                avatarUrl={currentUser.avatarUrl}
              />
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleLogout}>Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex items-center justify-between px-1 py-3">
      <div className="flex min-w-0 items-center gap-2 font-medium">
        <Avatar className="h-5 w-5">
          <AvatarImage src={currentUser?.avatarUrl ?? undefined} />
          <AvatarFallback>
            <CircleUser size={24} />
          </AvatarFallback>
        </Avatar>
        <UserName name={currentUser?.name} email={currentUser?.email} />
        <span className={adminBadgeClass}>Admin</span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="ml-2 h-7 w-7 rounded-lg p-0"
            size="icon"
          >
            <MoreVerticalIcon fontSize={20} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right">
          <DropdownMenuLabel className="flex items-center gap-2">
            {currentUser ? (
              <UserInfo
                email={currentUser.email}
                name={currentUser.name}
                avatarUrl={currentUser.avatarUrl}
              />
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleLogout}>Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
