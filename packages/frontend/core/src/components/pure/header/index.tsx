import {
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
  SidebarSwitch,
} from '@affine/component/app-sidebar';
import { useIsTinyScreen } from '@affine/core/hooks/use-is-tiny-screen';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { useCallback, useRef, useState } from 'react';

import * as style from './style.css';

interface HeaderPros {
  left?: ReactNode;
  right?: ReactNode;
  center?: ReactNode;
  bottomBorder?: boolean;
  isFloat?: boolean;
}

// The Header component is used to solve the following problems
// 1. Manage layout issues independently of page or business logic
// 2. Dynamic centered middle element (relative to the main-container), when the middle element is detected to collide with the two elements, the line wrapping process is performed
export const Header = ({
  left,
  center,
  right,
  bottomBorder,
  isFloat,
}: HeaderPros) => {
  const sidebarSwitchRef = useRef<HTMLDivElement | null>(null);
  const leftSlotRef = useRef<HTMLDivElement | null>(null);
  const centerSlotRef = useRef<HTMLDivElement | null>(null);
  const rightSlotRef = useRef<HTMLDivElement | null>(null);

  const [headerRoot, setHeaderRoot] = useState<HTMLDivElement | null>(null);

  const onSetHeaderRoot = useCallback((node: HTMLDivElement | null) => {
    setHeaderRoot(node);
  }, []);

  const isTinyScreen = useIsTinyScreen({
    container: headerRoot,
    leftStatic: sidebarSwitchRef,
    leftSlot: [leftSlotRef],
    centerDom: centerSlotRef,
    rightSlot: [rightSlotRef],
  });

  const open = useAtomValue(appSidebarOpenAtom);
  const appSidebarFloating = useAtomValue(appSidebarFloatingAtom);
  return (
    <div
      className={clsx(style.header, bottomBorder && style.bottomBorder, {
        [style.headerFloat]: isFloat,
      })}
      data-open={open}
      data-sidebar-floating={appSidebarFloating}
      data-testid="header"
      ref={onSetHeaderRoot}
    >
      <div
        className={clsx(style.headerSideContainer, {
          block: isTinyScreen,
        })}
      >
        <div
          className={clsx(
            style.headerItem,
            'top-item',
            !open ? 'top-item-visible' : ''
          )}
        >
          <div ref={sidebarSwitchRef}>
            <SidebarSwitch show={!open} />
          </div>
        </div>
        <div className={clsx(style.headerItem, 'left')}>
          <div ref={leftSlotRef}>{left}</div>
        </div>
      </div>
      <div
        className={clsx({
          [style.headerCenter]: center,
        })}
        ref={centerSlotRef}
      >
        {center}
      </div>
      <div
        className={clsx(style.headerSideContainer, 'right', {
          block: isTinyScreen,
        })}
      >
        <div ref={rightSlotRef} className={clsx(style.headerItem, 'right')}>
          {right}
        </div>
      </div>
    </div>
  );
};

Header.displayName = 'Header';

export const HeaderDivider = () => {
  return <div className={style.headerDivider} />;
};
