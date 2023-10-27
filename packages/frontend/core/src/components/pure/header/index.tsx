import {
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
  SidebarSwitch,
} from '@affine/component/app-sidebar';
import { useIsTinyScreen } from '@toeverything/hooks/use-is-tiny-screen';
import clsx from 'clsx';
import { type Atom, useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { forwardRef, useRef } from 'react';

import * as style from './style.css';
import { TopTip } from './top-tip';
import { WindowsAppControls } from './windows-app-controls';

interface HeaderPros {
  left?: ReactNode;
  right?: ReactNode;
  center?: ReactNode;
  mainContainerAtom: Atom<HTMLDivElement | null>;
  bottomBorder?: boolean;
}

// The Header component is used to solve the following problems
// 1. Manage layout issues independently of page or business logic
// 2. Dynamic centered middle element (relative to the main-container), when the middle element is detected to collide with the two elements, the line wrapping process is performed
export const Header = forwardRef<HTMLDivElement, HeaderPros>(function Header(
  { left, center, right, mainContainerAtom, bottomBorder },
  ref
) {
  const sidebarSwitchRef = useRef<HTMLDivElement | null>(null);
  const leftSlotRef = useRef<HTMLDivElement | null>(null);
  const centerSlotRef = useRef<HTMLDivElement | null>(null);
  const rightSlotRef = useRef<HTMLDivElement | null>(null);
  const windowControlsRef = useRef<HTMLDivElement | null>(null);

  const mainContainer = useAtomValue(mainContainerAtom);

  const isTinyScreen = useIsTinyScreen({
    mainContainer,
    leftStatic: sidebarSwitchRef,
    leftSlot: [leftSlotRef],
    centerDom: centerSlotRef,
    rightSlot: [rightSlotRef],
    rightStatic: windowControlsRef,
  });

  const isWindowsDesktop = environment.isDesktop && environment.isWindows;
  const open = useAtomValue(appSidebarOpenAtom);
  const appSidebarFloating = useAtomValue(appSidebarFloatingAtom);
  return (
    <>
      <TopTip />
      <div
        className={clsx(style.header, bottomBorder && style.bottomBorder)}
        // data-has-warning={showWarning}
        data-open={open}
        data-sidebar-floating={appSidebarFloating}
        data-testid="header"
        ref={ref}
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
            'is-window': isWindowsDesktop,
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
          <div className={clsx(style.headerItem, 'top-item')}>
            <div ref={windowControlsRef}>
              {isWindowsDesktop ? <WindowsAppControls /> : null}
            </div>
          </div>
          <div className={clsx(style.headerItem, 'right')}>
            <div ref={rightSlotRef}>{right}</div>
          </div>
        </div>
      </div>
    </>
  );
});

Header.displayName = 'Header';
