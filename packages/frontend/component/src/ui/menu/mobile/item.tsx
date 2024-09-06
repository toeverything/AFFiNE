import { useCallback, useContext } from 'react';

import type { MenuItemProps } from '../menu.types';
import { useMenuItem } from '../use-menu-item';
import { MobileMenuContext } from './context';

let preventDefaultFlag = false;
const preventDefault = () => {
  preventDefaultFlag = true;
};

export const MobileMenuItem = (props: MenuItemProps) => {
  const { setOpen } = useContext(MobileMenuContext);
  const { className, children, otherProps } = useMenuItem(props);
  const { onSelect, onClick, divide, ...restProps } = otherProps;

  const onItemClick = useCallback(
    (e: any) => {
      onSelect?.(e);
      onClick?.({ ...e, preventDefault });
      if (preventDefaultFlag) {
        preventDefaultFlag = false;
      } else {
        setOpen?.(false);
      }
    },
    [onClick, onSelect, setOpen]
  );

  return (
    <div
      role="menuitem"
      onClick={onItemClick}
      className={className}
      data-divider={divide}
      {...restProps}
    >
      {children}
    </div>
  );
};
