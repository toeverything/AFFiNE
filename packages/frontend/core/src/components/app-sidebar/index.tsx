import { Skeleton } from '@affine/component';
import { ResizePanel } from '@affine/component/resize-panel';
import { useAtom, useAtomValue } from 'jotai';
import { debounce } from 'lodash-es';
import type { PropsWithChildren, ReactElement } from 'react';
import { useEffect } from 'react';

import { fallbackHeaderStyle, fallbackStyle } from './fallback.css';
import {
  floatingMaxWidth,
  navBodyStyle,
  navHeaderStyle,
  navStyle,
  navWrapperStyle,
  sidebarFloatMaskStyle,
} from './index.css';
import {
  APP_SIDEBAR_OPEN,
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
  appSidebarResizingAtom,
  appSidebarWidthAtom,
} from './index.jotai';
import { SidebarHeader } from './sidebar-header';

export type AppSidebarProps = PropsWithChildren<{
  hasBackground?: boolean;
}>;

export type History = {
  stack: string[];
  current: number;
};

const MAX_WIDTH = 480;
const MIN_WIDTH = 256;

export function AppSidebar(props: AppSidebarProps): ReactElement {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  const [width, setWidth] = useAtom(appSidebarWidthAtom);
  const [floating, setFloating] = useAtom(appSidebarFloatingAtom);
  const [resizing, setResizing] = useAtom(appSidebarResizingAtom);

  useEffect(() => {
    function onResize() {
      const isFloatingMaxWidth = window.matchMedia(
        `(max-width: ${floatingMaxWidth}px)`
      ).matches;
      const isOverflowWidth = window.matchMedia(
        `(max-width: ${width / 0.4}px)`
      ).matches;
      const isFloating = isFloatingMaxWidth || isOverflowWidth;
      if (
        open === undefined &&
        localStorage.getItem(APP_SIDEBAR_OPEN) === null
      ) {
        // give the initial value,
        // so that the sidebar can be closed on mobile by default
        setOpen(!isFloating);
      }
      setFloating(isFloating);
    }

    const dOnResize = debounce(onResize, 50);
    window.addEventListener('resize', dOnResize);
    return () => {
      window.removeEventListener('resize', dOnResize);
    };
  }, [open, setFloating, setOpen, width]);

  const transparent = environment.isDesktop && !props.hasBackground;
  const isMacosDesktop = environment.isDesktop && environment.isMacOs;
  const hasRightBorder = !environment.isDesktop || !transparent;

  return (
    <>
      <ResizePanel
        floating={floating}
        open={open}
        resizing={resizing}
        maxWidth={MAX_WIDTH}
        minWidth={MIN_WIDTH}
        width={width}
        resizeHandlePos="right"
        onOpen={setOpen}
        onResizing={setResizing}
        onWidthChange={setWidth}
        className={navWrapperStyle}
        resizeHandleVerticalPadding={transparent ? 16 : 0}
        data-transparent={transparent}
        data-has-border={hasRightBorder}
        data-testid="app-sidebar-wrapper"
        data-is-macos-electron={isMacosDesktop}
        data-has-background={environment.isDesktop && props.hasBackground}
      >
        <nav className={navStyle} data-testid="app-sidebar">
          <SidebarHeader />
          <div className={navBodyStyle} data-testid="sliderBar-inner">
            {props.children}
          </div>
        </nav>
      </ResizePanel>
      <div
        data-testid="app-sidebar-float-mask"
        data-open={open}
        data-is-floating={floating}
        className={sidebarFloatMaskStyle}
        onClick={() => setOpen(false)}
      />
    </>
  );
}

export const AppSidebarFallback = (): ReactElement | null => {
  const width = useAtomValue(appSidebarWidthAtom);
  return (
    <div
      style={{ width }}
      className={navWrapperStyle}
      data-has-border
      data-open="true"
    >
      <nav className={navStyle}>
        <div className={navHeaderStyle} data-open="true" />
        <div className={navBodyStyle}>
          <div className={fallbackStyle}>
            <div className={fallbackHeaderStyle}>
              <Skeleton variant="circular" width={40} height={40} />
              <Skeleton variant="rectangular" width={150} height={40} />
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
};

export * from './add-page-button';
export * from './app-download-button';
export * from './app-updater-button';
export * from './category-divider';
export * from './index.css';
export * from './menu-item';
export * from './quick-search-input';
export * from './sidebar-containers';
export * from './sidebar-header';
export { appSidebarFloatingAtom, appSidebarOpenAtom, appSidebarResizingAtom };
