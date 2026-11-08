import { type MouseEvent, useCallback, useContext } from 'react';

import type { MenuItemProps } from '../menu.types';
import { useMenuItem } from '../use-menu-item';
import { MobileMenuContext } from './context';

export const MobileMenuItem = (props: MenuItemProps) => {
  const { setOpen, subMenus, setSubMenus } = useContext(MobileMenuContext);
  const { className, children, otherProps } = useMenuItem(props);
  const {
    onSelect,
    onClick,
    divide,
    textValue: _textValue,
    ...restProps
  } = otherProps;

  const onItemClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      onSelect?.(event.nativeEvent);
      onClick?.(event);
      if (event.defaultPrevented || event.nativeEvent.defaultPrevented) {
        return;
      }
      if (subMenus.length > 1) {
        // assume the user can only click the last menu
        // (mimic the back button)
        setSubMenus(subMenus.slice(0, -1));
      } else {
        setOpen?.(false);
      }
    },
    [onClick, onSelect, setOpen, setSubMenus, subMenus]
  );

  return (
    <button
      type="button"
      onClick={onItemClick}
      className={className}
      disabled={props.disabled}
      data-divider={divide}
      {...restProps}
    >
      {children}
    </button>
  );
};
