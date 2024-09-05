import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@affine/admin/components/ui/accordion';
import { buttonVariants } from '@affine/admin/components/ui/button';
import { cn } from '@affine/admin/utils';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { ClipboardListIcon, SettingsIcon, UsersIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useGetServerRuntimeConfig } from '../settings/use-get-server-runtime-config';
import { CollapsibleItem } from './collapsible-item';
import { useNav } from './context';
import { UserDropdown } from './user-dropdown';

export function Nav() {
  const { moduleList } = useGetServerRuntimeConfig();
  const { setCurrentModule } = useNav();

  return (
    <div className="flex flex-col gap-4 py-2 justify-between flex-grow overflow-hidden">
      <nav className="flex flex-col gap-1 px-2 flex-grow overflow-hidden">
        <NavLink
          to={'/admin/accounts'}
          className={({ isActive }) =>
            cn(
              buttonVariants({
                variant: isActive ? 'default' : 'ghost',
                size: 'sm',
              }),
              isActive &&
                'dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white',
              'justify-start',
              'flex-none'
            )
          }
        >
          <UsersIcon className="mr-2 h-4 w-4" />
          Accounts
        </NavLink>
        {/* <Link
          to={'/admin/ai'}
          className={cn(
            buttonVariants({
              variant: activeTab === 'AI' ? 'default' : 'ghost',
              size: 'sm',
            }),
            activeTab === 'AI' &&
              'dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white',
            'justify-start',
            'flex-none'
          )}
        >
          <CpuIcon className="mr-2 h-4 w-4" />
          AI
        </Link> */}
        <NavLink
          to={'/admin/config'}
          className={({ isActive }) =>
            cn(
              buttonVariants({
                variant: isActive ? 'default' : 'ghost',
                size: 'sm',
              }),
              isActive &&
                'dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white',
              'justify-start',
              'flex-none'
            )
          }
        >
          <ClipboardListIcon className="mr-2 h-4 w-4" />
          Config
        </NavLink>

        <Accordion type="multiple" className="w-full h-full  overflow-hidden">
          <AccordionItem
            value="item-1"
            className="border-b-0 h-full flex flex-col gap-1 w-full"
          >
            <NavLink
              to={'/admin/settings'}
              className={({ isActive }) =>
                cn(
                  buttonVariants({
                    variant: isActive ? 'default' : 'ghost',
                    size: 'sm',
                  }),
                  isActive &&
                    'dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white',
                  'justify-start',
                  'flex-none',
                  'w-full'
                )
              }
            >
              <AccordionTrigger
                className={'flex items-center justify-between w-full'}
              >
                <div className="flex items-center">
                  <SettingsIcon className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </div>
              </AccordionTrigger>
            </NavLink>

            <AccordionContent className="h-full overflow-hidden w-full">
              <ScrollAreaPrimitive.Root
                className={cn('relative overflow-hidden w-full h-full')}
              >
                <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] [&>div]:!block">
                  {moduleList.map(module => (
                    <CollapsibleItem
                      key={module.moduleName}
                      items={module.keys}
                      title={module.moduleName}
                      changeModule={setCurrentModule}
                    />
                  ))}
                </ScrollAreaPrimitive.Viewport>
                <ScrollAreaPrimitive.ScrollAreaScrollbar
                  className={cn(
                    'flex touch-none select-none transition-colors',

                    'h-full w-2.5 border-l border-l-transparent p-[1px]'
                  )}
                >
                  <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
                </ScrollAreaPrimitive.ScrollAreaScrollbar>
                <ScrollAreaPrimitive.Corner />
              </ScrollAreaPrimitive.Root>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </nav>

      <UserDropdown />
    </div>
  );
}
