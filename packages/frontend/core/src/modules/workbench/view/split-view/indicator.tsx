import type { MenuProps } from '@affine/component';
import { Menu } from '@affine/component';
import clsx from 'clsx';
import type { HTMLAttributes, MouseEventHandler } from 'react';
import { forwardRef, memo, useCallback, useMemo, useState } from 'react';

import * as styles from './indicator.css';

export interface SplitViewMenuProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  open?: boolean;
  onOpenMenu?: () => void;
  setPressed: (v: boolean) => void;
}

export const SplitViewMenuIndicator = memo(
  forwardRef<HTMLDivElement, SplitViewMenuProps>(
    function SplitViewMenuIndicator(
      {
        className,
        active,
        open,
        setPressed,
        onOpenMenu,
        ...attrs
      }: SplitViewMenuProps,
      ref
    ) {
      // dnd's `isDragging` changes after mouseDown and mouseMoved
      const onMouseDown = useCallback(() => {
        const t = setTimeout(() => setPressed(true), 100);
        window.addEventListener(
          'mouseup',
          () => {
            clearTimeout(t);
            setPressed(false);
          },
          { once: true }
        );
      }, [setPressed]);

      const onClick: MouseEventHandler = useCallback(() => {
        !open && onOpenMenu?.();
      }, [onOpenMenu, open]);

      return (
        <div
          ref={ref}
          data-active={active}
          data-testid="split-view-indicator"
          className={clsx(className, styles.indicator)}
          onClick={onClick}
          onMouseDown={onMouseDown}
          {...attrs}
        >
          <div className={styles.indicatorInner} />
        </div>
      );
    }
  )
);

interface SplitViewIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  isDragging?: boolean;
  isActive?: boolean;
  menuItems?: React.ReactNode;
  // import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities' is not allowed
  listeners?: any;
  setPressed?: (pressed: boolean) => void;
}
export const SplitViewIndicator = ({
  isDragging,
  isActive,
  menuItems,
  listeners,
  setPressed,
}: SplitViewIndicatorProps) => {
  const active = isActive || isDragging;
  const [menuOpen, setMenuOpen] = useState(false);

  // prevent menu from opening when dragging
  const setOpenMenuManually = useCallback((open: boolean) => {
    if (open) return;
    setMenuOpen(open);
  }, []);
  const openMenu = useCallback(() => {
    setMenuOpen(true);
  }, []);

  const menuRootOptions = useMemo(
    () =>
      ({
        open: menuOpen,
        onOpenChange: setOpenMenuManually,
      }) satisfies MenuProps['rootOptions'],
    [menuOpen, setOpenMenuManually]
  );
  const menuContentOptions = useMemo(
    () =>
      ({
        align: 'center',
      }) satisfies MenuProps['contentOptions'],
    []
  );

  return (
    <div data-is-dragging={isDragging} className={styles.indicatorWrapper}>
      <Menu
        contentOptions={menuContentOptions}
        items={menuItems}
        rootOptions={menuRootOptions}
      >
        <div className={styles.menuTrigger} />
      </Menu>
      <SplitViewMenuIndicator
        open={menuOpen}
        onOpenMenu={openMenu}
        active={active}
        setPressed={setPressed}
        {...listeners}
      />
    </div>
  );
};
