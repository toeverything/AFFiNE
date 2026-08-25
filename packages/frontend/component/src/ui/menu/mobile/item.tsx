import {
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import { createPenClickCompatHandlers } from '../../../utils/pen-click-compat';
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
    (
      event: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>
    ) => {
      onSelect?.(event.nativeEvent);
      onClick?.(event as MouseEvent<HTMLButtonElement>);
      if (event.defaultPrevented || event.nativeEvent.defaultPrevented) {
        return;
      }

      const dismiss = () => {
        if (subMenus.length > 1) {
          // assume the user can only click the last menu
          // (mimic the back button)
          setSubMenus(subMenus.slice(0, -1));
        } else {
          setOpen?.(false);
        }
      };

      if ('pointerType' in event && event.pointerType === 'pen') {
        // Defer teardown for Pencil so mode/navigation side effects aren't
        // racing modal unmount (indicator can flash then snap back).
        requestAnimationFrame(dismiss);
      } else {
        dismiss();
      }
    },
    [onClick, onSelect, setOpen, setSubMenus, subMenus]
  );

  // Pencil taps inside the mobile menu modal often skip synthesized `click`.
  const penClickCompat = useMemo(
    () => createPenClickCompatHandlers(onItemClick),
    [onItemClick]
  );

  return (
    <button
      type="button"
      className={className}
      disabled={props.disabled}
      data-divider={divide}
      {...restProps}
      {...penClickCompat}
    >
      {children}
    </button>
  );
};
