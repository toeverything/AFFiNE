import { useCallback, useContext, useMemo } from 'react';

import { createPenClickCompatHandlers } from '../../../utils/pen-click-compat';
import type { MenuItemProps } from '../menu.types';
import { useMenuItem } from '../use-menu-item';
import { MobileMenuContext } from './context';

let preventDefaultFlag = false;
const preventDefault = () => {
  preventDefaultFlag = true;
};

export const MobileMenuItem = (props: MenuItemProps) => {
  const { setOpen, subMenus, setSubMenus } = useContext(MobileMenuContext);
  const { className, children, otherProps } = useMenuItem(props);
  const { onSelect, onClick, divide, ...restProps } = otherProps;

  const onItemClick = useCallback(
    (e: any) => {
      onSelect?.(e);
      onClick?.({ ...e, preventDefault });
      if (preventDefaultFlag) {
        preventDefaultFlag = false;
      } else {
        const dismiss = () => {
          if (subMenus.length > 1) {
            // assume the user can only click the last menu
            // (mimic the back button)
            setSubMenus(subMenus.slice(0, -1));
          } else {
            setOpen?.(false);
          }
        };
        // Defer teardown for Pencil so mode/navigation side effects aren't
        // racing modal unmount (indicator can flash then snap back).
        if (e?.pointerType === 'pen') {
          requestAnimationFrame(dismiss);
        } else {
          dismiss();
        }
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
    <div
      role="menuitem"
      className={className}
      data-divider={divide}
      {...restProps}
      {...penClickCompat}
    >
      {children}
    </div>
  );
};
