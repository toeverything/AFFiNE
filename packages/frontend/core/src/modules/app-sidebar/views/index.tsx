import { Skeleton } from '@affine/component';
import { ResizePanel } from '@affine/component/resize-panel';
import { useAppSettingHelper } from '@affine/core/components/hooks/affine/use-app-setting-helper';
import { NavigateContext } from '@affine/core/components/hooks/use-navigate-helper';
import { WorkspaceNavigator } from '@affine/core/components/workspace-selector';
import {
  useLiveData,
  useService,
  useServiceOptional,
  WorkspaceService,
} from '@toeverything/infra';
import { debounce } from 'lodash-es';
import type { PropsWithChildren, ReactElement } from 'react';
import { useCallback, useContext, useEffect, useMemo } from 'react';

import { AppSidebarService } from '../services/app-sidebar';
import * as styles from './fallback.css';
import {
  floatingMaxWidth,
  navBodyStyle,
  navHeaderStyle,
  navStyle,
  navWrapperStyle,
  sidebarFloatMaskStyle,
} from './index.css';
import { SidebarHeader } from './sidebar-header';

export type History = {
  stack: string[];
  current: number;
};

const MAX_WIDTH = 480;
const MIN_WIDTH = 248;

export function AppSidebar({ children }: PropsWithChildren) {
  const { appSettings } = useAppSettingHelper();

  const clientBorder = appSettings.clientBorder;

  const appSidebarService = useService(AppSidebarService).sidebar;

  const open = useLiveData(appSidebarService.open$);
  const width = useLiveData(appSidebarService.width$);
  const floating = useLiveData(appSidebarService.responsiveFloating$);
  const resizing = useLiveData(appSidebarService.resizing$);

  useEffect(() => {
    // do not float app sidebar on desktop
    if (BUILD_CONFIG.isElectron) {
      return;
    }

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
        appSidebarService.getCachedAppSidebarOpenState() === undefined
      ) {
        // give the initial value,
        // so that the sidebar can be closed on mobile by default
        appSidebarService.setOpen(!isFloating);
      }
      appSidebarService.setResponsiveFloating(isFloating);
    }

    const dOnResize = debounce(onResize, 50);
    window.addEventListener('resize', dOnResize);
    return () => {
      window.removeEventListener('resize', dOnResize);
    };
  }, [appSidebarService, open, width]);

  const hasRightBorder = !BUILD_CONFIG.isElectron && !clientBorder;
  const isMacosDesktop = BUILD_CONFIG.isElectron && environment.isMacOs;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      appSidebarService.setOpen(open);
    },
    [appSidebarService]
  );

  const handleResizing = useCallback(
    (resizing: boolean) => {
      appSidebarService.setResizing(resizing);
    },
    [appSidebarService]
  );

  const handleWidthChange = useCallback(
    (width: number) => {
      appSidebarService.setWidth(width);
    },
    [appSidebarService]
  );

  const handleClose = useCallback(() => {
    appSidebarService.setOpen(false);
  }, [appSidebarService]);

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
        onOpen={handleOpenChange}
        onResizing={handleResizing}
        onWidthChange={handleWidthChange}
        className={navWrapperStyle}
        resizeHandleOffset={0}
        resizeHandleVerticalPadding={clientBorder ? 16 : 0}
        data-transparent
        data-open={open}
        data-has-border={hasRightBorder}
        data-testid="app-sidebar-wrapper"
        data-is-macos-electron={isMacosDesktop}
        data-client-border={clientBorder}
      >
        <nav className={navStyle} data-testid="app-sidebar">
          {!BUILD_CONFIG.isElectron && <SidebarHeader />}
          <div className={navBodyStyle} data-testid="sliderBar-inner">
            {children}
          </div>
        </nav>
      </ResizePanel>
      <div
        data-testid="app-sidebar-float-mask"
        data-open={open}
        data-is-floating={floating}
        className={sidebarFloatMaskStyle}
        onClick={handleClose}
      />
    </>
  );
}

export function FallbackHeader() {
  return (
    <div className={styles.fallbackHeader}>
      <FallbackHeaderSkeleton />
    </div>
  );
}

export function FallbackHeaderWithWorkspaceNavigator() {
  // if navigate is not defined, it is rendered outside of router
  // WorkspaceNavigator requires navigate context
  // todo: refactor
  const navigate = useContext(NavigateContext);

  const currentWorkspace = useServiceOptional(WorkspaceService);
  return (
    <div className={styles.fallbackHeader}>
      {currentWorkspace && navigate ? (
        <WorkspaceNavigator
          showSettingsButton
          showSyncStatus
          showEnableCloudButton
        />
      ) : (
        <FallbackHeaderSkeleton />
      )}
    </div>
  );
}

export function FallbackHeaderSkeleton() {
  return (
    <>
      <Skeleton variant="rectangular" width={32} height={32} />
      <Skeleton variant="rectangular" width={150} height={32} flex={1} />
      <Skeleton variant="circular" width={25} height={25} />
    </>
  );
}

const randomWidth = () => {
  return Math.floor(Math.random() * 200) + 100;
};

const RandomBar = ({ className }: { className?: string }) => {
  const width = useMemo(() => randomWidth(), []);
  return (
    <Skeleton
      variant="rectangular"
      width={width}
      height={16}
      className={className}
    />
  );
};

const RandomBars = ({ count, header }: { count: number; header?: boolean }) => {
  return (
    <div className={styles.fallbackGroupItems}>
      {header ? (
        <Skeleton
          className={styles.fallbackItemHeader}
          variant="rectangular"
          width={50}
          height={16}
        />
      ) : null}
      {Array.from({ length: count }).map((_, index) => (
        <RandomBar key={index} />
      ))}
    </div>
  );
};

const FallbackBody = () => {
  return (
    <div className={styles.fallbackBody}>
      <RandomBars count={3} />
      <RandomBars count={4} header />
      <RandomBars count={4} header />
      <RandomBars count={3} header />
    </div>
  );
};

export const AppSidebarFallback = (): ReactElement | null => {
  const appSidebarService = useService(AppSidebarService).sidebar;
  const width = useLiveData(appSidebarService.width$);
  const { appSettings } = useAppSettingHelper();
  const clientBorder = appSettings.clientBorder;

  return (
    <div
      style={{ width }}
      className={navWrapperStyle}
      data-has-border={!BUILD_CONFIG.isElectron && !clientBorder}
      data-open="true"
    >
      <nav className={navStyle}>
        {!BUILD_CONFIG.isElectron ? <div className={navHeaderStyle} /> : null}
        <div className={navBodyStyle}>
          <div className={styles.fallback}>
            <FallbackHeaderWithWorkspaceNavigator />
            <FallbackBody />
          </div>
        </div>
      </nav>
    </div>
  );
};

/**
 * NOTE(@forehalo): this is a copy of [AppSidebarFallback] without [WorkspaceNavigator] which will introduce a lot useless dependencies for shell(tab bar)
 */
export const ShellAppSidebarFallback = () => {
  const appSidebarService = useService(AppSidebarService).sidebar;
  const width = useLiveData(appSidebarService.width$);
  const { appSettings } = useAppSettingHelper();
  const clientBorder = appSettings.clientBorder;

  return (
    <div
      style={{ width }}
      className={navWrapperStyle}
      data-has-border={!BUILD_CONFIG.isElectron && !clientBorder}
      data-open="true"
    >
      <nav className={navStyle}>
        {!BUILD_CONFIG.isElectron ? <div className={navHeaderStyle} /> : null}
        <div className={navBodyStyle}>
          <div className={styles.fallback}>
            <FallbackHeader />
            <FallbackBody />
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
