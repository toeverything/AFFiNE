import { Button } from '@affine/component';
import { getEnvironment } from '@affine/env';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
  ResetIcon,
  SidebarIcon,
} from '@blocksuite/icons';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { useAtom, useAtomValue } from 'jotai';
import type { PropsWithChildren, ReactElement, ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';

import { IconButton } from '../../ui/button/icon-button';
import {
  floatingMaxWidth,
  haloStyle,
  installLabelStyle,
  navBodyStyle,
  navFooterStyle,
  navHeaderStyle,
  navStyle,
  navWidthVar,
  navWrapperStyle,
  particlesStyle,
  sidebarButtonStyle,
  sidebarFloatMaskStyle,
  updaterButtonStyle,
} from './index.css';
import {
  APP_SIDEBAR_OPEN,
  appSidebarOpenAtom,
  appSidebarResizingAtom,
  appSidebarWidthAtom,
  updateAvailableAtom,
} from './index.jotai';
import { ResizeIndicator } from './resize-indicator';

export { appSidebarOpenAtom };

export type AppSidebarProps = PropsWithChildren<{
  footer?: ReactNode | undefined;
}>;

export function AppSidebar(props: AppSidebarProps): ReactElement {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  const clientUpdateAvailable = useAtomValue(updateAvailableAtom);
  const t = useAFFiNEI18N();
  const appSidebarWidth = useAtomValue(appSidebarWidthAtom);
  const initialRender = open === undefined;

  const isResizing = useAtomValue(appSidebarResizingAtom);

  const handleSidebarOpen = useCallback(() => {
    setOpen(open => !open);
  }, [setOpen]);

  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === undefined && localStorage.getItem(APP_SIDEBAR_OPEN) === null) {
      // give the initial value,
      // so that the sidebar can be closed on mobile by default
      const { matches } = window.matchMedia(
        `(min-width: ${floatingMaxWidth}px)`
      );

      setOpen(matches);
    }
  }, [open, setOpen]);

  const environment = getEnvironment();
  const isMacosDesktop = environment.isDesktop && environment.isMacOs;
  if (initialRender) {
    // avoid the UI flash
    return <div />;
  }
  return (
    <div
      style={assignInlineVars({
        [navWidthVar]: `${appSidebarWidth}px`,
      })}
      className={navWrapperStyle}
      data-open={open}
      data-is-macos-electron={isMacosDesktop}
      data-is-resizing={isResizing}
    >
      <nav className={navStyle} ref={navRef} data-testid="app-sidebar">
        <div
          className={navHeaderStyle}
          data-is-macos-electron={isMacosDesktop}
          data-open={open}
        >
          {isMacosDesktop && (
            <>
              <IconButton
                size="middle"
                onClick={() => {
                  window.history.back();
                }}
              >
                <ArrowLeftSmallIcon />
              </IconButton>
              <IconButton
                size="middle"
                onClick={() => {
                  window.history.forward();
                }}
                style={{ marginLeft: '32px' }}
              >
                <ArrowRightSmallIcon />
              </IconButton>
            </>
          )}
          <IconButton
            data-testid="app-sidebar-arrow-button-collapse"
            className={sidebarButtonStyle}
            onClick={handleSidebarOpen}
          >
            <SidebarIcon width={24} height={24} />
          </IconButton>
        </div>
        <div className={navBodyStyle}>{props.children}</div>
        {clientUpdateAvailable && (
          <Button
            onClick={() => {
              window.apis?.updater.updateClient();
            }}
            noBorder
            className={updaterButtonStyle}
            type={'light'}
          >
            <div className={particlesStyle} aria-hidden="true"></div>
            <span className={haloStyle} aria-hidden="true"></span>
            <div className={installLabelStyle}>
              <ResetIcon />
              <span>{t['Restart Install Client Update']()}</span>
            </div>
          </Button>
        )}
        <div className={navFooterStyle}>{props.footer}</div>
      </nav>
      <div
        data-testid="app-sidebar-float-mask"
        data-open={open}
        className={sidebarFloatMaskStyle}
        onClick={() => setOpen(false)}
      />
      <ResizeIndicator targetElement={navRef.current} />
    </div>
  );
}
