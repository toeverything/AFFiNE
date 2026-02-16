import { buttonVariants } from '@affine/admin/components/ui/button';
import { cn } from '@affine/admin/utils';
import { SettingsIcon } from '@blocksuite/icons/rc';
import { cssVarV2 } from '@toeverything/theme/v2';
import { NavLink } from 'react-router-dom';

export const SettingsItem = ({ isCollapsed }: { isCollapsed: boolean }) => {
  if (isCollapsed) {
    return (
      <NavLink
        to="/admin/settings"
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
        })}
      >
        <SettingsIcon fontSize={20} />
      </NavLink>
    );
  }

  return (
    <NavLink
      to="/admin/settings"
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
      <span className="flex items-center p-0.5 mr-2">
        <SettingsIcon fontSize={20} />
      </span>
      Settings
    </NavLink>
  );
};
