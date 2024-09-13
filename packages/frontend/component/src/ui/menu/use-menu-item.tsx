import { DoneIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';

import type { MenuItemProps } from './menu.types';
import { mobileMenuItem } from './mobile/styles.css';
import * as styles from './styles.css';

export const useMenuItem = <T extends MenuItemProps>({
  children: propsChildren,
  type = 'default',
  className: propsClassName,
  prefix,
  prefixIcon,
  suffix,
  suffixIcon,
  checked,
  selected,
  block,
  ...otherProps
}: T) => {
  const className = clsx(
    styles.menuItem,
    {
      danger: type === 'danger',
      warning: type === 'warning',
      checked,
      selected,
      block,
      [mobileMenuItem]: BUILD_CONFIG.isMobileEdition,
    },
    propsClassName
  );

  const children = (
    <>
      {prefix}

      {prefixIcon ? (
        <div className={styles.menuItemIcon}>{prefixIcon}</div>
      ) : null}

      <span className={styles.menuSpan}>{propsChildren}</span>

      {suffixIcon ? (
        <div className={styles.menuItemIcon}>{suffixIcon}</div>
      ) : null}

      {suffix}

      {checked || selected ? (
        <div className={clsx(styles.menuItemIcon, 'selected')}>
          <DoneIcon />
        </div>
      ) : null}
    </>
  );

  return {
    children,
    className,
    otherProps,
  };
};
