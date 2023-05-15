import { getEnvironment } from '@affine/env';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { useAtom, useAtomValue } from 'jotai';
import type { PropsWithChildren, ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  floatingMaxWidth,
  navBodyStyle,
  navStyle,
  navWidthVar,
  navWrapperStyle,
  sidebarFloatMaskStyle,
} from './index.css';
import {
  APP_SIDEBAR_OPEN,
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
  appSidebarResizingAtom,
  appSidebarWidthAtom,
  updateAvailableAtom,
} from './index.jotai';
import { ResizeIndicator } from './resize-indicator';
import { SidebarHeader } from './sidebar-header';

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
  const appSidebarWidth = useAtomValue(appSidebarWidthAtom);
  const [appSidebarFloating, setAppSidebarFloating] = useAtom(
    appSidebarFloatingAtom
  );
  const initialRender = open === undefined;

  const isResizing = useAtomValue(appSidebarResizingAtom);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onResize() {
      const { matches } = window.matchMedia(
        `(max-width: ${floatingMaxWidth}px)`
      );
      if (
        open === undefined &&
        localStorage.getItem(APP_SIDEBAR_OPEN) === null
      ) {
        // give the initial value,
        // so that the sidebar can be closed on mobile by default
        setOpen(!matches);
      }
      setAppSidebarFloating(matches && !!open);
    }

    onResize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [open, setAppSidebarFloating, setOpen]);

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
          <div className={navBodyStyle} data-testid="sliderBar-inner">
            {props.children}
          </div>
        </nav>
        <ResizeIndicator targetElement={navRef.current} />
      </div>
      <div
        data-testid="app-sidebar-float-mask"
        data-open={open}
        data-is-floating={appSidebarFloating}
        className={sidebarFloatMaskStyle}
        onClick={() => setOpen(false)}
      />
    </>
  );
}

export * from './add-page-button';
export * from './app-updater-button';
export * from './category-divider';
export { AppSidebarFallback } from './fallback';
export * from './menu-item';
export * from './quick-search-input';
export * from './sidebar-containers';
export {
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
  appSidebarResizingAtom,
  updateAvailableAtom,
};
