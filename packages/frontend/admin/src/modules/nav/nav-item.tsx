import { cn } from '@affine/admin/utils';
import { NavLink } from 'react-router-dom';

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  to: string;
  isActive?: boolean;
  isCollapsed?: boolean;
}

const navItemBaseClass =
  'group inline-flex h-9 items-center gap-2 rounded-lg text-sm font-medium transition-all duration-150';
const navItemStateClass =
  'text-sidebar-foreground-secondary hover:bg-sidebar-hover hover:text-sidebar-foreground';
const navItemActiveClass =
  'bg-sidebar-active text-sidebar-foreground shadow-sm';

export const NavItem = ({ icon, label, to, isCollapsed }: NavItemProps) => {
  const className = ({ isActive }: { isActive: boolean }) =>
    cn(
      navItemBaseClass,
      navItemStateClass,
      isCollapsed ? 'w-9 justify-center px-0' : 'w-full justify-start px-2',
      isActive && navItemActiveClass
    );

  if (isCollapsed) {
    return (
      <NavLink to={to} className={className}>
        {icon}
      </NavLink>
    );
  }

  return (
    <NavLink to={to} className={className}>
      <span className="flex items-center p-0.5">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
};
