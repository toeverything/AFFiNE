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
import { cssVarV2 } from '@toeverything/theme/v2';
import { CircleUser } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { affineFetch } from '../../fetch-utils';
import { useCurrentUser, useRevalidateCurrentUser } from '../common';

interface UserDropdownProps {
  isCollapsed: boolean;
}

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
        <span
          className="w-fit rounded px-2 py-0.5 text-xs h-5 border text-center inline-flex items-center font-normal"
          style={{
            borderRadius: '4px',
            backgroundColor: cssVarV2('chip/label/blue'),
            borderColor: cssVarV2('layer/insideBorder/border'),
          }}
        >
          Admin
        </span>
      </div>
    </>
  );
};

export function UserDropdown({ isCollapsed }: UserDropdownProps) {
  const currentUser = useCurrentUser();
  const relative = useRevalidateCurrentUser();

  const handleLogout = useCallback(() => {
    affineFetch('/api/auth/sign-out')
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
          <Button variant="ghost" className="w-10 h-10" size="icon">
            <Avatar className="w-5 h-5">
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
    <div
      className={`flex flex-none items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-1 py-3 flex-nowrap`}
    >
      <div className="flex items-center gap-2 font-medium text-ellipsis break-words overflow-hidden">
        <Avatar className="w-5 h-5">
          <AvatarImage src={currentUser?.avatarUrl ?? undefined} />
          <AvatarFallback>
            <CircleUser size={24} />
          </AvatarFallback>
        </Avatar>
        {currentUser?.name ? (
          <span
            className="text-sm text-nowrap text-ellipsis break-words overflow-hidden"
            title={currentUser?.name}
          >
            {currentUser?.name}
          </span>
        ) : (
          // Fallback to email prefix if name is not available
          <span className="text-sm" title={currentUser?.email.split('@')[0]}>
            {currentUser?.email.split('@')[0]}
          </span>
        )}
        <span
          className="ml-2 rounded px-2 py-0.5 text-xs h-5 border text-center inline-flex items-center font-normal"
          style={{
            borderRadius: '4px',
            backgroundColor: cssVarV2('chip/label/blue'),
            borderColor: cssVarV2('layer/insideBorder/border'),
          }}
        >
          Admin
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="ml-2 p-1 h-6">
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
