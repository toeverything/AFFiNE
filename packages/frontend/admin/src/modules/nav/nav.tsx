import { buttonVariants } from '@affine/admin/components/ui/button';
import { cn } from '@affine/admin/utils';
import { AccountIcon, SelfhostIcon } from '@blocksuite/icons/rc';
import { cssVarV2 } from '@toeverything/theme/v2';
import { LayoutDashboardIcon, ListChecksIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { ServerVersion } from './server-version';
import { SettingsItem } from './settings-item';
import { UserDropdown } from './user-dropdown';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  to: string;
  isActive?: boolean;
  isCollapsed?: boolean;
}

const NavItem = ({ icon, label, to, isCollapsed }: NavItemProps) => {
  if (isCollapsed) {
    return (
      <NavLink
        to={to}
        className={cn(
          buttonVariants({
            variant: 'ghost',
            className: 'w-10 h-10',
            size: 'icon',
          })
        )}
        style={({ isActive }) => ({
          backgroundColor: isActive
            ? cssVarV2('selfhost/button/sidebarButton/bg/select')
            : undefined,
          '&:hover': {
            backgroundColor: cssVarV2('selfhost/button/sidebarButton/bg/hover'),
          },
        })}
      >
        {icon}
      </NavLink>
    );
  }

  return (
    <NavLink
      to={to}
      className={cn(
        buttonVariants({
          variant: 'ghost',
        }),
        'justify-start flex-none text-sm font-medium px-2'
      )}
      style={({ isActive }) => ({
        backgroundColor: isActive
          ? cssVarV2('selfhost/button/sidebarButton/bg/select')
          : undefined,
        '&:hover': {
          backgroundColor: cssVarV2('selfhost/button/sidebarButton/bg/hover'),
        },
      })}
    >
      <span className="flex items-center p-0.5 mr-2">{icon}</span>
      {label}
    </NavLink>
  );
};

interface NavProps {
  isCollapsed?: boolean;
}

export function Nav({ isCollapsed = false }: NavProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 py-2 justify-between flex-grow h-full overflow-hidden',
        isCollapsed && 'overflow-visible'
      )}
    >
      <nav
        className={cn(
          'flex flex-1 flex-col gap-1 px-2 flex-grow overflow-y-auto overflow-x-hidden',
          isCollapsed && 'items-center px-0 gap-1 overflow-visible'
        )}
      >
        <NavItem
          to="/admin/accounts"
          icon={<AccountIcon fontSize={20} />}
          label="Accounts"
          isCollapsed={isCollapsed}
        />
        {environment.isSelfHosted ? null : (
          <NavItem
            to="/admin/workspaces"
            icon={<LayoutDashboardIcon size={18} />}
            label="Workspaces"
            isCollapsed={isCollapsed}
          />
        )}
        <NavItem
          to="/admin/queue"
          icon={<ListChecksIcon size={18} />}
          label="Queue"
          isCollapsed={isCollapsed}
        />
        {/* <NavItem
          to="/admin/ai"
          icon={<AiOutlineIcon fontSize={20} />}
          label="AI"
          isCollapsed={isCollapsed}
        /> */}
        <SettingsItem isCollapsed={isCollapsed} />
        <NavItem
          to="/admin/about"
          icon={<SelfhostIcon fontSize={20} />}
          label="About"
          isCollapsed={isCollapsed}
        />
      </nav>
      <div
        className={cn(
          'flex gap-2 px-2 flex-col overflow-hidden',
          isCollapsed && 'items-center px-0 gap-1'
        )}
      >
        <UserDropdown isCollapsed={isCollapsed} />
        {isCollapsed ? null : <ServerVersion />}
      </div>
    </div>
  );
}
