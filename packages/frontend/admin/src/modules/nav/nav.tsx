import { buttonVariants } from '@affine/admin/components/ui/button';
import { cn } from '@affine/admin/utils';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

import { UserDropdown } from './user-dropdown';

export interface NavProp {
  title: string;
  to: string;
  label?: string;
  icon: LucideIcon;
}

export function Nav({
  links,
  activeTab,
}: {
  links: NavProp[];
  activeTab: string;
}) {
  return (
    <div className="group flex flex-col gap-4 py-2 justify-between flex-grow">
      <nav className="grid gap-1 px-2">
        {links.map((link, index) => (
          <Link
            key={index}
            to={link.to}
            className={cn(
              buttonVariants({
                variant: activeTab === link.title ? 'default' : 'ghost',
                size: 'sm',
              }),
              activeTab === link.title &&
                'dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white',
              'justify-start'
            )}
          >
            <link.icon className="mr-2 h-4 w-4" />
            {link.title}
            {link.label && (
              <span
                className={cn(
                  'ml-auto',
                  activeTab === link.title && 'text-background dark:text-white'
                )}
              >
                {link.label}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <UserDropdown />
    </div>
  );
}
