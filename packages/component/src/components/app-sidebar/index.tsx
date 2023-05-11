import { Button } from '@affine/component';
import { getEnvironment } from '@affine/env';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ResetIcon } from '@blocksuite/icons';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { useAtom, useAtomValue } from 'jotai';
import type { PropsWithChildren, ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  floatingMaxWidth,
  haloStyle,
  installLabelStyle,
  navBodyStyle,
  navStyle,
  navWidthVar,
  navWrapperStyle,
  particlesStyle,
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
import { SidebarHeader } from './sidebar-header';

export { appSidebarOpenAtom };

export type AppSidebarProps = PropsWithChildren;

function useEnableAnimation() {
  const [enable, setEnable] = useState(false);
  useEffect(() => {
    setTimeout(() => {
      setEnable(true);
    }, 500);
  }, []);
  return enable;
}

export function AppSidebar(props: AppSidebarProps): ReactElement {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  const clientUpdateAvailable = useAtomValue(updateAvailableAtom);
  const t = useAFFiNEI18N();
  const appSidebarWidth = useAtomValue(appSidebarWidthAtom);
  const initialRender = open === undefined;

  const isResizing = useAtomValue(appSidebarResizingAtom);
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

  // disable animation to avoid UI flash
  const enableAnimation = useEnableAnimation();

  const environment = getEnvironment();
  const isMacosDesktop = environment.isDesktop && environment.isMacOs;
  if (initialRender) {
    // avoid the UI flash
    return <div />;
  }

  return (
    <>
      <div
        style={assignInlineVars({
          [navWidthVar]: `${appSidebarWidth}px`,
        })}
        className={navWrapperStyle}
        data-open={open}
        data-is-macos-electron={isMacosDesktop}
        data-enable-animation={enableAnimation && !isResizing}
      >
        <nav className={navStyle} ref={navRef} data-testid="app-sidebar">
          <SidebarHeader />
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
        </nav>
        <ResizeIndicator targetElement={navRef.current} />
      </div>
      <div
        data-testid="app-sidebar-float-mask"
        data-open={open}
        className={sidebarFloatMaskStyle}
        onClick={() => setOpen(false)}
      />
    </>
  );
}

export * from './add-page-button';
export * from './category-divider';
export { AppSidebarFallback } from './fallback';
export * from './menu-item';
export * from './quick-search-input';
export * from './sidebar-containers';
export { appSidebarResizingAtom };
