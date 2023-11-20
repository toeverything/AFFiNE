import { DoneIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import { useMemo } from 'react';

import { MenuIcon } from './menu-icon';
import { type MenuItemProps } from './menu-item';
import * as styles from './styles.css';

interface useMenuItemProps {
  children: MenuItemProps['children'];
  type: MenuItemProps['type'];
  className: MenuItemProps['className'];
  preFix: MenuItemProps['preFix'];
  endFix: MenuItemProps['endFix'];
  checked?: MenuItemProps['checked'];
  selected?: MenuItemProps['selected'];
  block?: MenuItemProps['block'];
}

export const useMenuItem = ({
  children: propsChildren,
  type = 'default',
  className: propsClassName,
  preFix,
  endFix,
  checked,
  selected,
  block,
}: useMenuItemProps) => {
  const className = useMemo(
    () =>
      clsx(
        styles.menuItem,
        {
          danger: type === 'danger',
          warning: type === 'warning',
          checked,
          selected,
          block,
        },
        propsClassName
      ),
    [block, checked, propsClassName, selected, type]
  );

  const children = useMemo(
    () => (
      <>
        {preFix}
        <span className={styles.menuSpan}>{propsChildren}</span>
        {endFix}

        {checked || selected ? (
          <MenuIcon
            position="end"
            className={clsx({
              selected,
              checked,
            })}
          >
            <DoneIcon />
          </MenuIcon>
        ) : null}
      </>
    ),
    [checked, endFix, preFix, propsChildren, selected]
  );

  return {
    children,
    className,
  };
};
