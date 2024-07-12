import {
  MenuItem,
  type MenuItemProps,
  MenuLinkItem,
} from '@affine/core/components/app-sidebar';
import type { Collection } from '@affine/env/filter';
import * as Collapsible from '@radix-ui/react-collapsible';
import {
  createContext,
  forwardRef,
  type PropsWithChildren,
  type ReactNode,
  useContext,
  useState,
} from 'react';
import { Link, type To } from 'react-router-dom';

import * as styles from './node.css';

type SidebarDocTreeNode =
  | {
      type: 'collection';
      data: Collection;
    }
  // | { type: 'tag' }
  // | { type: 'folder' }
  | {
      type: 'doc';
      data: string;
    };

export type SidebarDocTreeNodeProps = PropsWithChildren<{
  node: SidebarDocTreeNode;
  subTree?: ReactNode;
  to?: To;
  linkComponent?: React.ComponentType<{ to: To; className?: string }>;

  menuItemProps?: MenuItemProps & Record<`data-${string}`, unknown>;
  rootProps?: Collapsible.CollapsibleProps & Record<`data-${string}`, unknown>;
}>;

type SidebarDocTreeNodeContext = {
  ancestors: SidebarDocTreeNode[];
};

export const sidebarDocTreeContext =
  createContext<SidebarDocTreeNodeContext | null>(null);

/**
 * Tree node for the sidebar doc/folder/tag/collection tree.
 * This component is used to manage:
 * - Collapsing state
 * - Ancestors context
 * - Link/Menu item rendering
 * - Subtree indentation (left/top)
 */
export const SidebarDocTreeNode = forwardRef(function SidebarDocTreeNode(
  {
    node,
    children,
    subTree,
    to,
    linkComponent: LinkComponent = Link,
    menuItemProps,
    rootProps,
  }: SidebarDocTreeNodeProps,
  ref: React.Ref<HTMLDivElement>
) {
  const [collapsed, setCollapsed] = useState(true);
  const { ancestors } = useContext(sidebarDocTreeContext) ?? { ancestors: [] };

  const finalMenuItemProps: SidebarDocTreeNodeProps['menuItemProps'] = {
    ...menuItemProps,
    collapsed,
    onCollapsedChange: setCollapsed,
  };

  return (
    <sidebarDocTreeContext.Provider value={{ ancestors: [...ancestors, node] }}>
      <Collapsible.Root
        {...rootProps}
        ref={ref}
        open={!collapsed}
        onOpenChange={setCollapsed}
      >
        {to ? (
          <MenuLinkItem
            to={to}
            linkComponent={LinkComponent}
            {...finalMenuItemProps}
          >
            {children}
          </MenuLinkItem>
        ) : (
          <MenuItem {...finalMenuItemProps}>{children}</MenuItem>
        )}
        <Collapsible.Content className={styles.collapseContent}>
          {collapsed ? null : subTree}
        </Collapsible.Content>
      </Collapsible.Root>
    </sidebarDocTreeContext.Provider>
  );
});
