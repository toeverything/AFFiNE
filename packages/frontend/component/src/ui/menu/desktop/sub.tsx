import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { useContext, useMemo } from 'react';

import type { MenuSubProps } from '../menu.types';
import * as styles from '../styles.css';
import { useMenuItem } from '../use-menu-item';
import { DesktopMenuContext } from './context';

const EMPTY_SUB_OPTIONS: NonNullable<MenuSubProps['subOptions']> = {};
const EMPTY_SUB_CONTENT_OPTIONS: NonNullable<
  MenuSubProps['subContentOptions']
> = {};

export const DesktopMenuSub = ({
  children: propsChildren,
  items,
  portalOptions,
  subOptions,
  triggerOptions,
  subContentOptions,
}: MenuSubProps) => {
  const { defaultOpen, ...otherSubOptions } = subOptions ?? EMPTY_SUB_OPTIONS;
  const {
    className: subContentClassName = '',
    style: contentStyle,
    ...otherSubContentOptions
  } = subContentOptions ?? EMPTY_SUB_CONTENT_OPTIONS;
  const { type } = useContext(DesktopMenuContext);
  const { className, children, otherProps } = useMenuItem({
    children: propsChildren,
    suffixIcon: <ArrowRightSmallIcon />,
    ...triggerOptions,
  });

  const contentClassName = useMemo(
    () => clsx(styles.menuContent, subContentClassName),
    [subContentClassName]
  );

  if (type === 'context-menu') {
    return (
      <ContextMenu.Sub defaultOpen={defaultOpen} {...otherSubOptions}>
        <ContextMenu.SubTrigger className={className} {...otherProps}>
          {children}
        </ContextMenu.SubTrigger>
        <ContextMenu.Portal {...portalOptions}>
          <ContextMenu.SubContent
            className={contentClassName}
            style={{ zIndex: 'var(--affine-z-index-popover)', ...contentStyle }}
            {...otherSubContentOptions}
          >
            {items}
          </ContextMenu.SubContent>
        </ContextMenu.Portal>
      </ContextMenu.Sub>
    );
  }

  return (
    <DropdownMenu.Sub defaultOpen={defaultOpen} {...otherSubOptions}>
      <DropdownMenu.SubTrigger className={className} {...otherProps}>
        {children}
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal {...portalOptions}>
        <DropdownMenu.SubContent
          className={contentClassName}
          style={{ zIndex: 'var(--affine-z-index-popover)', ...contentStyle }}
          {...otherSubContentOptions}
        >
          {items}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
};
