import { Wrapper } from '@affine/component';
import {
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
  SidebarSwitch,
} from '@affine/component/app-sidebar';
import { isDesktop } from '@affine/env/constant';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import debounce from 'lodash.debounce';
import type { MutableRefObject, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import * as style from './style.css';
import { TopTip } from './top-tip';
import { WindowsAppControls } from './windows-app-controls';
interface HeaderPros {
  left?: ReactNode;
  right?: ReactNode;
  center?: ReactNode;
}

const useIsTinyScreen = ({
  mainContainer,
  leftStatic,
  leftSlot,
  centerDom,
  rightStatic,
  rightSlot,
}: {
  mainContainer: HTMLElement;
  leftStatic: MutableRefObject<HTMLElement | null>;
  leftSlot: MutableRefObject<HTMLElement | null>[];
  centerDom: MutableRefObject<HTMLElement | null>;
  rightStatic: MutableRefObject<HTMLElement | null>;
  rightSlot: MutableRefObject<HTMLElement | null>[];
}) => {
  const [isTinyScreen, setIsTinyScreen] = useState(false);

  useEffect(() => {
    const handleResize = debounce(() => {
      if (!centerDom.current) {
        return;
      }
      const leftStaticWidth = leftStatic.current?.clientWidth || 0;
      const leftSlotWidth = leftSlot.reduce((accWidth, dom) => {
        return accWidth + (dom.current?.clientWidth || 0);
      }, 0);

      const rightStaticWidth = rightStatic.current?.clientWidth || 0;

      const rightSlotWidth = rightSlot.reduce((accWidth, dom) => {
        return accWidth + (dom.current?.clientWidth || 0);
      }, 0);

      if (!leftSlotWidth && !rightSlotWidth) {
        if (isTinyScreen) {
          setIsTinyScreen(false);
        }
        return;
      }

      const containerRect = mainContainer.getBoundingClientRect();
      const centerRect = centerDom.current.getBoundingClientRect();

      if (
        leftStaticWidth + leftSlotWidth + containerRect.left >=
          centerRect.left ||
        containerRect.right - centerRect.right <=
          rightSlotWidth + rightStaticWidth
      ) {
        setIsTinyScreen(true);
      } else {
        setIsTinyScreen(false);
      }
    }, 100);

    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(mainContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, [
    centerDom,
    isTinyScreen,
    leftSlot,
    leftStatic,
    mainContainer,
    rightSlot,
    rightStatic,
  ]);

  return isTinyScreen;
};

// The Header component is used to solve the following problems
// 1. Manage layout issues independently of page or business logic
// 2. Dynamic centered middle element (relative to the main-container), when the middle element is detected to collide with the two elements, the line wrapping process is performed
export const Header = ({ left, center, right }: HeaderPros) => {
  const sidebarSwitchRef = useRef<HTMLDivElement | null>(null);
  const leftSlotRef = useRef<HTMLDivElement | null>(null);
  const centerSlotRef = useRef<HTMLDivElement | null>(null);
  const rightSlotRef = useRef<HTMLDivElement | null>(null);
  const windowControlsRef = useRef<HTMLDivElement | null>(null);

  const isTinyScreen = useIsTinyScreen({
    mainContainer: document.querySelector('.main-container') || document.body,
    leftStatic: sidebarSwitchRef,
    leftSlot: [leftSlotRef],
    centerDom: centerSlotRef,
    rightSlot: [rightSlotRef],
    rightStatic: windowControlsRef,
  });

  const isWindowsDesktop = globalThis.platform === 'win32' && isDesktop;
  const open = useAtomValue(appSidebarOpenAtom);
  const appSidebarFloating = useAtomValue(appSidebarFloatingAtom);
  return (
    <>
      <TopTip />
      <div
        className={style.header}
        // data-has-warning={showWarning}
        data-open={open}
        data-sidebar-floating={appSidebarFloating}
        data-testid="header"
      >
        <div
          className={clsx(style.headerSideContainer, {
            block: isTinyScreen,
          })}
        >
          <div className={clsx(style.headerItem, 'top-item')}>
            <div ref={sidebarSwitchRef}>
              {!open && (
                <Wrapper marginRight={20}>
                  <SidebarSwitch />
                </Wrapper>
              )}
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
};
