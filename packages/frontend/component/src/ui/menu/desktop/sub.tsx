import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { useMemo } from 'react';

import type { MenuSubProps } from '../menu.types';
import * as styles from '../styles.css';
import { useMenuItem } from '../use-menu-item';
import { useMenuContentController } from './controller';

export const DesktopMenuSub = ({
  children: propsChildren,
  items,
  portalOptions,
  subOptions: {
    defaultOpen,
    onOpenChange,
    open: rootOpen,
    ...otherSubOptions
  } = {},
  triggerOptions,
  subContentOptions: {
    className: subContentClassName = '',
    sideOffset,
    style: contentStyle,
    ...otherSubContentOptions
  } = {},
}: MenuSubProps) => {
  const { className, children, otherProps } = useMenuItem({
    ...triggerOptions,
    children: propsChildren,
    suffixIcon: <ArrowRightSmallIcon />,
  });

  const { handleOpenChange, contentOffset, contentRef, open } =
    useMenuContentController({
      defaultOpen,
      open: rootOpen,
      onOpenChange,
      side: 'right',
      sideOffset: (sideOffset ?? 0) + 12,
    });

  return (
    <DropdownMenu.Sub
      defaultOpen={defaultOpen}
      onOpenChange={handleOpenChange}
      open={open}
      {...otherSubOptions}
    >
      <DropdownMenu.SubTrigger className={className} {...otherProps}>
        {children}
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal {...portalOptions}>
        <DropdownMenu.SubContent
          sideOffset={contentOffset}
          ref={contentRef}
          className={useMemo(
            () => clsx(styles.menuContent, subContentClassName),
            [subContentClassName]
          )}
          style={{ zIndex: 'var(--affine-z-index-popover)', ...contentStyle }}
          avoidCollisions={false}
          {...otherSubContentOptions}
        >
          {items}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
};
