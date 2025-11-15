import * as RadixContextMenu from '@radix-ui/react-context-menu';
import clsx from 'clsx';
import type { RefAttributes } from 'react';

import * as styles from '../styles.css';
import { DesktopMenuContext } from './context';
import * as desktopStyles from './styles.css';

export type ContextMenuProps = RadixContextMenu.ContextMenuProps &
  RadixContextMenu.ContextMenuTriggerProps &
  RefAttributes<HTMLSpanElement> & {
    items: React.ReactNode;
    contentProps?: RadixContextMenu.ContextMenuContentProps;
  };

const ContextMenuContextValue = {
  type: 'context-menu',
} as const;

export const ContextMenu = ({
  children,
  onOpenChange,
  dir,
  modal,
  items,
  contentProps,
  ...props
}: ContextMenuProps) => {
  return (
    <DesktopMenuContext.Provider value={ContextMenuContextValue}>
      <RadixContextMenu.Root
        onOpenChange={onOpenChange}
        dir={dir}
        modal={modal}
      >
        <RadixContextMenu.Trigger {...props}>
          {children}
        </RadixContextMenu.Trigger>
        <RadixContextMenu.Portal>
          <RadixContextMenu.Content
            className={clsx(
              styles.menuContent,
              desktopStyles.contentAnimation,
              contentProps?.className
            )}
            style={{
              zIndex: 'var(--affine-z-index-popover)',
              ...contentProps?.style,
            }}
            {...contentProps}
          >
            {items}
          </RadixContextMenu.Content>
        </RadixContextMenu.Portal>
      </RadixContextMenu.Root>
    </DesktopMenuContext.Provider>
  );
};
