import { Wrapper } from '@affine/component';
import { BrowserWarning } from '@affine/component/affine-banner';
import {
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
  SidebarSwitch,
} from '@affine/component/app-sidebar';
import { isDesktop } from '@affine/env/constant';
import clsx from 'clsx';
import { useAtom, useAtomValue } from 'jotai';
import throttle from 'lodash.throttle';
import type { MutableRefObject, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { guideDownloadClientTipAtom } from '../../../atoms/guide';
import DownloadClientTip from '../../blocksuite/workspace-header/download-tips';
import {
  OSWarningMessage,
  shouldShowWarning,
} from '../../blocksuite/workspace-header/utils';
import * as style from './style.css';
import { WindowsAppControls } from './windows-app-controls';

interface HeaderPros {
  left?: ReactNode;
  right?: ReactNode;
  center?: ReactNode;
}

const useIsTinyScreen = ({
  mainContainer,
  leftDoms,
  centerDom,
  rightDoms,
}: {
  mainContainer: HTMLElement;
  leftDoms: MutableRefObject<HTMLElement | null>[];
  centerDom: MutableRefObject<HTMLElement | null>;
  rightDoms: MutableRefObject<HTMLElement | null>[];
}) => {
  const [isTinyScreen, setIsTinyScreen] = useState(false);

  useEffect(() => {
    const handleResize = throttle(() => {
      if (!centerDom.current) {
        return;
      }
      const leftTotalWidth = leftDoms.reduce((accWidth, dom) => {
        return accWidth + (dom.current?.clientWidth || 0);
      }, 0);

      const rightTotalWidth = rightDoms.reduce((accWidth, dom) => {
        return accWidth + (dom.current?.clientWidth || 0);
      }, 0);

      const containerRect = mainContainer.getBoundingClientRect();
      const centerRect = centerDom.current.getBoundingClientRect();

      const offset = isTinyScreen ? 50 : 0;
      if (
        leftTotalWidth + containerRect.left >= centerRect.left - offset ||
        containerRect.right - centerRect.right <= rightTotalWidth + offset
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
  }, [centerDom, isTinyScreen, leftDoms, mainContainer, rightDoms]);

  return isTinyScreen;
};

export const Header = ({ left, center, right }: HeaderPros) => {
  const [showWarning, setShowWarning] = useState(false);
  const [showDownloadTip, setShowDownloadTip] = useAtom(
    guideDownloadClientTipAtom
  );

  const sidebarSwitchRef = useRef<HTMLDivElement | null>(null);
  const leftSlotRef = useRef<HTMLDivElement | null>(null);
  const centerSlotRef = useRef<HTMLDivElement | null>(null);
  const rightSlotRef = useRef<HTMLDivElement | null>(null);
  const windowControlsRef = useRef<HTMLDivElement | null>(null);

  const isTinyScreen = useIsTinyScreen({
    mainContainer: document.querySelector('.main-container') || document.body,
    leftDoms: [sidebarSwitchRef, leftSlotRef],
    centerDom: centerSlotRef,
    rightDoms: [rightSlotRef, windowControlsRef],
  });

  useEffect(() => {
    setShowWarning(shouldShowWarning());
  }, []);

  const isWindowsDesktop = globalThis.platform === 'win32' && isDesktop;
  const open = useAtomValue(appSidebarOpenAtom);
  const appSidebarFloating = useAtomValue(appSidebarFloatingAtom);
  return (
    <>
      {showDownloadTip ? (
        <DownloadClientTip
          show={showDownloadTip}
          onClose={() => {
            setShowDownloadTip(false);
            localStorage.setItem('affine-is-dt-hide', '1');
          }}
        />
      ) : (
        <BrowserWarning
          show={showWarning}
          message={<OSWarningMessage />}
          onClose={() => {
            setShowWarning(false);
          }}
        />
      )}
      <div
        className={style.header}
        data-has-warning={showWarning}
        data-open={open}
        data-sidebar-floating={appSidebarFloating}
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
            'has-min-width': !isTinyScreen,
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
