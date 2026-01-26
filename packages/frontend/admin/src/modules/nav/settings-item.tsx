import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@affine/admin/components/ui/accordion';
import { buttonVariants } from '@affine/admin/components/ui/button';
import { cn } from '@affine/admin/utils';
import { SettingsIcon } from '@blocksuite/icons/rc';
import * as NavigationMenuPrimitive from '@radix-ui/react-navigation-menu';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cssVarV2 } from '@toeverything/theme/v2';
import { NavLink } from 'react-router-dom';

import { KNOWN_CONFIG_GROUPS, UNKNOWN_CONFIG_GROUPS } from '../settings/config';
import { NormalSubItem } from './collapsible-item';
import { useNav } from './context';

export const SettingsItem = ({ isCollapsed }: { isCollapsed: boolean }) => {
  const { setCurrentModule } = useNav();

  if (isCollapsed) {
    return (
      <NavigationMenuPrimitive.Root
        className="flex-none relative"
        orientation="vertical"
      >
        <NavigationMenuPrimitive.List>
          <NavigationMenuPrimitive.Item>
            <NavigationMenuPrimitive.Trigger className="[&>svg]:hidden m-0 p-0">
              <NavLink
                to={'/admin/settings'}
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
            </NavigationMenuPrimitive.Trigger>
            <NavigationMenuPrimitive.Content>
              <ul
                className="border rounded-lg w-full flex flex-col p-1 min-w-[160px] max-h-[200px] overflow-y-auto"
                style={{
                  backgroundColor: cssVarV2('layer/background/overlayPanel'),
                  borderColor: cssVarV2('layer/insideBorder/blackBorder'),
                }}
              >
                {KNOWN_CONFIG_GROUPS.map(group => (
                  <li key={group.module} className="flex">
                    <NavLink
                      to={`/admin/settings/${group.module}`}
                      className={cn(
                        buttonVariants({
                          variant: 'ghost',
                          className:
                            'p-2 rounded-[6px] text-[14px] w-full justify-start font-normal',
                        })
                      )}
                      style={({ isActive }) => ({
                        backgroundColor: isActive
                          ? cssVarV2('selfhost/button/sidebarButton/bg/select')
                          : undefined,
                      })}
                      onClick={() => setCurrentModule?.(group.module)}
                    >
                      {group.name}
                    </NavLink>
                  </li>
                ))}
                {UNKNOWN_CONFIG_GROUPS.length ? (
                  <li className="flex px-2 pt-1 pb-0.5 text-xs font-medium opacity-70">
                    Experimental
                  </li>
                ) : null}
                {UNKNOWN_CONFIG_GROUPS.map(group => (
                  <li key={group.module} className="flex">
                    <NavLink
                      to={`/admin/settings/${group.module}`}
                      className={cn(
                        buttonVariants({
                          variant: 'ghost',
                          className:
                            'p-2 pl-6 rounded-[6px] text-[14px] w-full justify-start font-normal',
                        })
                      )}
                      style={({ isActive }) => ({
                        backgroundColor: isActive
                          ? cssVarV2('selfhost/button/sidebarButton/bg/select')
                          : undefined,
                      })}
                      onClick={() => setCurrentModule?.(group.module)}
                    >
                      {group.name}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </NavigationMenuPrimitive.Content>
          </NavigationMenuPrimitive.Item>
        </NavigationMenuPrimitive.List>
        <NavigationMenuPrimitive.Viewport className="absolute z-10 left-11 top-0" />
      </NavigationMenuPrimitive.Root>
    );
  }

  return (
    <Accordion type="multiple" className="w-full overflow-hidden">
      <AccordionItem
        value="item-1"
        className="border-b-0 h-full flex flex-col gap-1 w-full"
      >
        <NavLink
          to={'/admin/settings'}
          className={cn(
            buttonVariants({
              variant: 'ghost',
            }),
            'justify-start flex-none w-full px-2'
          )}
          style={({ isActive }) => ({
            backgroundColor: isActive
              ? cssVarV2('selfhost/button/sidebarButton/bg/select')
              : undefined,
          })}
        >
          <AccordionTrigger
            className={
              'flex items-center justify-between w-full [&[data-state=closed]>svg]:rotate-270 [&[data-state=open]>svg]:rotate-360'
            }
          >
            <div className="flex items-center">
              <span className="flex items-center p-0.5 mr-2">
                <SettingsIcon fontSize={20} />
              </span>
              <span>Settings</span>
            </div>
          </AccordionTrigger>
        </NavLink>

        <AccordionContent className="h-full overflow-hidden w-full pb-0">
          <ScrollAreaPrimitive.Root
            className={cn('relative overflow-hidden w-full h-full')}
          >
            <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] [&>div]:!block">
              {KNOWN_CONFIG_GROUPS.map(group => (
                <NormalSubItem
                  key={group.module}
                  module={group.module}
                  title={group.name}
                  changeModule={setCurrentModule}
                />
              ))}
              {UNKNOWN_CONFIG_GROUPS.length ? (
                <Accordion type="multiple" className="w-full">
                  <AccordionItem value="item-1" className="border-b-0">
                    <AccordionTrigger className="ml-8 py-2 px-2 rounded [&[data-state=closed]>svg]:rotate-270 [&[data-state=open]>svg]:rotate-360">
                      Experimental
                    </AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-1 py-1">
                      {UNKNOWN_CONFIG_GROUPS.map(group => (
                        <NormalSubItem
                          key={group.module}
                          module={group.module}
                          title={group.name}
                          changeModule={setCurrentModule}
                          indent="nested"
                        />
                      ))}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ) : null}
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
  );
};
