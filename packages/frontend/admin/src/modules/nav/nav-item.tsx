import { buttonVariants } from '@affine/admin/components/ui/button';
import { cn } from '@affine/admin/utils';
import { cssVarV2 } from '@toeverything/theme/v2';
import { NavLink } from 'react-router-dom';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  to: string;
  isActive?: boolean;
  isCollapsed?: boolean;
}

export const NavItem = ({ icon, label, to, isCollapsed }: NavItemProps) => {
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
      {icon}
      {label}
    </NavLink>
  );
};
