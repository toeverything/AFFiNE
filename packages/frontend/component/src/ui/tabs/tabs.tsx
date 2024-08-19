import * as TabsGroup from '@radix-ui/react-tabs';
import clsx from 'clsx';
import { forwardRef, type RefAttributes } from 'react';

import * as styles from './tabs.css';

export const TabsRoot = forwardRef<
  HTMLDivElement,
  TabsGroup.TabsProps & RefAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <TabsGroup.Root
      {...props}
      ref={ref}
      className={clsx(className, styles.tabsRoot)}
    >
      {children}
    </TabsGroup.Root>
  );
});

TabsRoot.displayName = 'TabsRoot';

export const TabsList = forwardRef<
  HTMLDivElement,
  TabsGroup.TabsListProps & RefAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <TabsGroup.List
      {...props}
      ref={ref}
      className={clsx(className, styles.tabsList)}
    >
      {children}
    </TabsGroup.List>
  );
});

TabsList.displayName = 'TabsList';

export const TabsTrigger = forwardRef<
  HTMLButtonElement,
  TabsGroup.TabsTriggerProps & RefAttributes<HTMLButtonElement>
>(({ children, className, ...props }, ref) => {
  return (
    <TabsGroup.Trigger
      {...props}
      ref={ref}
      className={clsx(className, styles.tabsTrigger)}
    >
      {children}
    </TabsGroup.Trigger>
  );
});

TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  HTMLDivElement,
  TabsGroup.TabsContentProps & RefAttributes<HTMLDivElement>
>(({ children, className, ...props }, ref) => {
  return (
    <TabsGroup.Content
      {...props}
      ref={ref}
      className={clsx(className, styles.tabsContent)}
    >
      {children}
    </TabsGroup.Content>
  );
});

TabsContent.displayName = 'TabsContent';

export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Trigger: TabsTrigger,
  Content: TabsContent,
};
