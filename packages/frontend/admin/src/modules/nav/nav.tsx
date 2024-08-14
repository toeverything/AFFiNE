import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@affine/admin/components/ui/accordion';
import { buttonVariants } from '@affine/admin/components/ui/button';
import { cn } from '@affine/admin/utils';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import {
  ClipboardListIcon,
  CpuIcon,
  SettingsIcon,
  UsersIcon,
} from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';

import { useGetServerRuntimeConfig } from '../settings/use-get-server-runtime-config';
import { CollapsibleItem } from './collapsible-item';
import { useNav } from './context';
import { UserDropdown } from './user-dropdown';

const TabsMap: { [key: string]: string } = {
  accounts: 'Accounts',
  ai: 'AI',
  config: 'Config',
  settings: 'Settings',
};

export function Nav() {
  const { moduleList } = useGetServerRuntimeConfig();
  const { activeTab, setActiveTab, setCurrentModule } = useNav();

  useEffect(() => {
    const path = window.location.pathname;
    for (const key in TabsMap) {
      if (path.includes(key)) {
        setActiveTab(TabsMap[key]);
        return;
      }
    }
  }, [setActiveTab]);

  return (
    <div className="flex flex-col gap-4 py-2 justify-between flex-grow overflow-hidden">
      <nav className="flex flex-col gap-1 px-2 flex-grow overflow-hidden">
        <Link
          to={'/admin/accounts'}
          className={cn(
            buttonVariants({
              variant: activeTab === 'Accounts' ? 'default' : 'ghost',
              size: 'sm',
            }),
            activeTab === 'Accounts' &&
              'dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white',
            'justify-start',
            'flex-none'
          )}
        >
          <UsersIcon className="mr-2 h-4 w-4" />
          Accounts
        </Link>
        <Link
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
        </Link>
        <Link
          to={'/admin/config'}
          className={cn(
            buttonVariants({
              variant: activeTab === 'Config' ? 'default' : 'ghost',
              size: 'sm',
            }),
            activeTab === 'Config' &&
              'dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white',
            'justify-start',
            'flex-none'
          )}
        >
          <ClipboardListIcon className="mr-2 h-4 w-4" />
          Config
        </Link>

        <Accordion type="multiple" className="w-full h-full  overflow-hidden">
          <AccordionItem
            value="item-1"
            className="border-b-0 h-full flex flex-col gap-1"
          >
            <Link to={'/admin/settings'}>
              <AccordionTrigger
                className={cn(
                  buttonVariants({
                    variant: activeTab === 'Settings' ? 'default' : 'ghost',
                    size: 'sm',
                  }),

                  activeTab === 'Settings' &&
                    'dark:bg-muted dark:text-white dark:hover:bg-muted dark:hover:text-white',
                  'justify-between',
                  'hover:no-underline'
                )}
              >
                <div className="flex items-center">
                  <SettingsIcon className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </div>
              </AccordionTrigger>
            </Link>

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
