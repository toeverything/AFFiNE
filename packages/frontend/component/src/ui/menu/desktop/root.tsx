import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import React, { useCallback, useImperativeHandle, useState } from 'react';

import type { MenuProps } from '../menu.types';
import * as styles from '../styles.css';
import { DesktopMenuContext } from './context';
import * as desktopStyles from './styles.css';

const MenuContextValue = {
  type: 'dropdown-menu',
} as const;

const EMPTY_ROOT_OPTIONS: NonNullable<MenuProps['rootOptions']> = {};
const EMPTY_CONTENT_OPTIONS: NonNullable<MenuProps['contentOptions']> = {};
const EMPTY_CONTENT_STYLE: React.CSSProperties = {};

export const DesktopMenu = ({
  children,
  items,
  noPortal,
  portalOptions,
  rootOptions: rawRootOptions,
  contentOptions: rawContentOptions,
  ref,
}: MenuProps) => {
  const { defaultOpen, modal, open, onOpenChange, onClose, ...rootOptions } =
    rawRootOptions ?? EMPTY_ROOT_OPTIONS;
  const {
    className = '',
    style: contentStyle = EMPTY_CONTENT_STYLE,
    ...otherContentOptions
  } = rawContentOptions ?? EMPTY_CONTENT_OPTIONS;
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const finalOpen = open ?? innerOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setInnerOpen(open);
      onOpenChange?.(open);
      if (!open) {
        onClose?.();
      }
    },
    [onOpenChange, onClose]
  );

  useImperativeHandle(
    ref,
    () => ({
      changeOpen: (open: boolean) => {
        setInnerOpen(open);
        onOpenChange?.(open);
      },
    }),
    [onOpenChange]
  );

  const ContentWrapper = noPortal ? React.Fragment : DropdownMenu.Portal;
  return (
    <DesktopMenuContext.Provider value={MenuContextValue}>
      <DropdownMenu.Root
        modal={modal ?? false}
        open={finalOpen}
        onOpenChange={handleOpenChange}
        {...rootOptions}
      >
        <DropdownMenu.Trigger
          asChild
          onClick={e => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          {children}
        </DropdownMenu.Trigger>

        <ContentWrapper {...portalOptions}>
          <DropdownMenu.Content
            className={clsx(
              styles.menuContent,
              desktopStyles.contentAnimation,
              className
            )}
            sideOffset={4}
            align="start"
            style={{ zIndex: 'var(--affine-z-index-popover)', ...contentStyle }}
            {...otherContentOptions}
          >
            {items}
          </DropdownMenu.Content>
        </ContentWrapper>
      </DropdownMenu.Root>
    </DesktopMenuContext.Provider>
  );
};
