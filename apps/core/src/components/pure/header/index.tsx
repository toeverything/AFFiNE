import { Wrapper } from '@affine/component';
import { BrowserWarning } from '@affine/component/affine-banner';
import {
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
  SidebarSwitch,
} from '@affine/component/app-sidebar';
import { isDesktop } from '@affine/env/constant';
import { CloseIcon, MinusIcon, RoundedRectangleIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import { useAtom, useAtomValue } from 'jotai';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { guideDownloadClientTipAtom } from '../../../atoms/guide';
import DownloadClientTip from '../../blocksuite/workspace-header/download-tips';
import {
  OSWarningMessage,
  shouldShowWarning,
} from '../../blocksuite/workspace-header/utils';
import * as style from './style.css';

interface HeaderPros {
  left?: ReactNode;
  right?: ReactNode;
  center?: ReactNode;
}

const WindowsAppControls = () => {
  const handleMinimizeApp = useCallback(() => {
    window.apis?.ui.handleMinimizeApp().catch(err => {
      console.error(err);
    });
  }, []);
  const handleMaximizeApp = useCallback(() => {
    window.apis?.ui.handleMaximizeApp().catch(err => {
      console.error(err);
    });
  }, []);
  const handleCloseApp = useCallback(() => {
    window.apis?.ui.handleCloseApp().catch(err => {
      console.error(err);
    });
  }, []);

  return (
    <div
      data-platform-target="win32"
      className={style.windowAppControlsWrapper}
    >
      <button
        data-type="minimize"
        className={style.windowAppControl}
        onClick={handleMinimizeApp}
      >
        <MinusIcon />
      </button>
      <button
        data-type="maximize"
        className={style.windowAppControl}
        onClick={handleMaximizeApp}
      >
        <RoundedRectangleIcon />
      </button>
      <button
        data-type="close"
        className={style.windowAppControl}
        onClick={handleCloseApp}
      >
        <CloseIcon />
      </button>
    </div>
  );
};

const useIsTinyScreen = (
  mainContainer: HTMLElement,
  domRefs: (HTMLElement | null)[]
) => {
  const [isTinyScreen, setIsTinyScreen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const containerWidth = mainContainer.clientWidth;

      const totalWidth = domRefs.reduce((accWidth, dom) => {
        return accWidth + (dom?.clientWidth || 0);
      }, 0);

      setIsTinyScreen(totalWidth > containerWidth);
    };

    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(mainContainer);
    return () => {
      resizeObserver.disconnect();
    };
  }, [domRefs, mainContainer]);

  return isTinyScreen;
};

const useCenterOffset = (
  mainContainer: HTMLElement,
  centerDom: HTMLElement | null
) => {
  const [centerOffset, setCenterOffset] = useState(0);
  useEffect(() => {
    const handleResize = () => {
      if (!centerDom) {
        return;
      }
      const containerWidth = mainContainer.clientWidth;
      const rect = centerDom.getBoundingClientRect();
      const offset = containerWidth / 2 - rect.width / 2 - rect.left;
      setCenterOffset(offset < 0 ? 0 : offset);
    };

    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(mainContainer);
    return () => {
      resizeObserver.disconnect();
    };
  }, [centerDom, mainContainer]);

  return centerOffset;
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

  const isTinyScreen = useIsTinyScreen(
    document.querySelector('.main-container') || document.body,
    [
      sidebarSwitchRef.current,
      leftSlotRef.current,
      centerSlotRef.current,
      rightSlotRef.current,
      windowControlsRef.current,
    ]
  );

  const centerOffset = useCenterOffset(
    document.querySelector('.main-container') || document.body,
    centerSlotRef.current
  );

  useEffect(() => {
    setShowWarning(shouldShowWarning());
  }, []);

  const isWindowsDesktop = globalThis.platform === 'win32' && isDesktop;
  // const isWindowsDesktop = true;
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
          style={{
            paddingLeft: centerOffset,
          }}
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
