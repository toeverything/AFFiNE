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
  prefixIconClassName,
  suffix,
  suffixIcon,
  suffixIconClassName,
  checked,
  selected,
  block,
  disabled,
  ...otherProps
}: T) => {
  const className = clsx(
    styles.menuItem,
    {
      danger: disabled ? false : type === 'danger',
      warning: disabled ? false : type === 'warning',
      disabled,
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
        <div className={clsx(styles.menuItemIcon, prefixIconClassName)}>
          {prefixIcon}
        </div>
      ) : null}

      <span className={styles.menuSpan}>{propsChildren}</span>

      {suffixIcon ? (
        <div className={clsx(styles.menuItemIcon, suffixIconClassName)}>
          {suffixIcon}
        </div>
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
