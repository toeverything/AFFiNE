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
import type { PropsWithChildren, ReactElement } from 'react';
import type { ReactNode } from 'react';
import { forwardRef, useCallback, useEffect } from 'react';

import { IconButton } from '../../ui/button/IconButton';
import {
  floatingMaxWidth,
  haloStyle,
  installLabelStyle,
  navBodyStyle,
  navFooterStyle,
  navHeaderStyle,
  navStyle,
  navWidthVar,
  particlesStyle,
  sidebarButtonStyle,
  sidebarFloatMaskStyle,
  updaterButtonStyle,
} from './index.css';
import {
  APP_SIDEBAR_OPEN,
  appSidebarOpenAtom,
  appSidebarWidthAtom,
  updateAvailableAtom,
} from './index.jotai';

export { appSidebarOpenAtom };

export type AppSidebarProps = PropsWithChildren<{
  footer?: ReactNode | undefined;
}>;

export const AppSidebar = forwardRef<HTMLElement, AppSidebarProps>(
  function AppSidebar(props, forwardedRef): ReactElement {
    const [open, setOpen] = useAtom(appSidebarOpenAtom);
    const clientUpdateAvailable = useAtomValue(updateAvailableAtom);
    const t = useAFFiNEI18N();
    const appSidebarWidth = useAtomValue(appSidebarWidthAtom);
    const initialRender = open === undefined;

    const handleSidebarOpen = useCallback(() => {
      setOpen(open => !open);
    }, [setOpen]);

    useEffect(() => {
      if (
        open === undefined &&
        localStorage.getItem(APP_SIDEBAR_OPEN) === null
      ) {
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
      <>
        <nav
          className={navStyle}
          ref={forwardedRef}
          style={assignInlineVars({
            [navWidthVar]: `${appSidebarWidth}px`,
          })}
          data-testid="app-sidebar"
          data-open={open}
          data-is-macos-electron={isMacosDesktop}
        >
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
                window.apis?.onClientUpdateInstall();
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
      </>
    );
  }
);

export type { ResizeIndicatorProps } from './resize-indicator';
export { ResizeIndicator } from './resize-indicator';
