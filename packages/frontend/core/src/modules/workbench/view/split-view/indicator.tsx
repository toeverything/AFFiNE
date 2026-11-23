import type { MenuProps } from '@affine/component';
import { Menu, Tooltip } from '@affine/component';
import { useI18n } from '@affine/i18n';
import clsx from 'clsx';
import type { HTMLAttributes, MouseEventHandler } from 'react';
import { forwardRef, memo, useCallback, useMemo, useState } from 'react';

import type { View } from '../../entities/view';
import * as styles from './indicator.css';

export interface SplitViewDragHandleProps extends HTMLAttributes<HTMLDivElement> {
  active?: boolean;
  dragging?: boolean;
  open?: boolean;
  onOpenMenu?: () => void;
}

export const SplitViewDragHandle = memo(
  forwardRef<HTMLDivElement, SplitViewDragHandleProps>(
    function SplitViewDragHandle(
      { className, active, open, onOpenMenu, dragging, onClick, ...attrs },
      ref
    ) {
      const handleOnClick: MouseEventHandler<HTMLDivElement> = useCallback(
        e => {
          !open && onOpenMenu?.();
          onClick?.(e);
        },
        [onOpenMenu, open, onClick]
      );

      return (
        <div
          ref={ref}
          data-active={active}
          data-dragging={dragging}
          data-testid="split-view-indicator"
          className={clsx(className, styles.indicator)}
          onClick={handleOnClick}
          {...attrs}
        >
          <div className={styles.indicatorGradient} />
          <div className={styles.indicatorInnerWrapper}>
            <div data-idx={0} className={styles.indicatorDot} />
            <div data-idx={1} className={styles.indicatorDot} />
            <div data-idx={2} className={styles.indicatorDot} />
          </div>
        </div>
      );
    }
  )
);

interface SplitViewIndicatorProps extends HTMLAttributes<HTMLDivElement> {
  view: View;
  isActive?: boolean;
  isDragging?: boolean;
  menuItems?: React.ReactNode;
  setPressed?: (pressed: boolean) => void;
  dragHandleRef?: React.RefObject<HTMLDivElement>;
}
export const SplitViewIndicator = memo(
  forwardRef<HTMLDivElement, SplitViewIndicatorProps>(
    function SplitViewIndicator(
      { isActive, menuItems, isDragging, dragHandleRef },
      ref
    ) {
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

      const t = useI18n();
      return (
        <div
          ref={ref}
          data-is-dragging={isDragging}
          className={styles.indicatorWrapper}
        >
          <Menu
            contentOptions={menuContentOptions}
            items={menuItems}
            rootOptions={menuRootOptions}
          >
            <div className={styles.menuTrigger} />
          </Menu>
          <Tooltip
            content={t['com.affine.split-view-drag-handle.tooltip']()}
            side="bottom"
          >
            <SplitViewDragHandle
              ref={dragHandleRef}
              open={menuOpen}
              onOpenMenu={openMenu}
              active={isActive}
              dragging={isDragging}
            />
          </Tooltip>
        </div>
      );
    }
  )
);
