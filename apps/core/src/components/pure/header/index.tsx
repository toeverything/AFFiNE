import { Wrapper } from '@affine/component';
import { BrowserWarning } from '@affine/component/affine-banner';
import {
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
  SidebarSwitch,
} from '@affine/component/app-sidebar';
import { isDesktop } from '@affine/env/constant';
import { CloseIcon, MinusIcon, RoundedRectangleIcon } from '@blocksuite/icons';
import { useAtom, useAtomValue } from 'jotai/index';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

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
export const Header = ({ left, center, right }: HeaderPros) => {
  const [showWarning, setShowWarning] = useState(false);
  const [showDownloadTip, setShowDownloadTip] = useAtom(
    guideDownloadClientTipAtom
  );
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
        <div className={style.headerLeft}>
          {!open && (
            <Wrapper marginRight={20}>
              <SidebarSwitch />
            </Wrapper>
          )}
          {left}
        </div>
        <div className={center ? style.headerCenter : ''}>{center}</div>
        <div className={style.headerRight}>{right}</div>
        {isWindowsDesktop ? <WindowsAppControls /> : null}
      </div>
    </>
  );
};
