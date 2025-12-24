import { type DropTargetGetFeedback, Skeleton } from '@affine/component';
import { ResizePanel } from '@affine/component/resize-panel';
import { useAppSettingHelper } from '@affine/core/components/hooks/affine/use-app-setting-helper';
import { NavigateContext } from '@affine/core/components/hooks/use-navigate-helper';
import { WorkspaceNavigator } from '@affine/core/components/workspace-selector';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import clsx from 'clsx';
import type { PropsWithChildren, ReactElement } from 'react';
import { useCallback, useContext, useEffect, useMemo } from 'react';

import { WorkbenchService } from '../../workbench';
import { allowedSplitViewEntityTypes } from '../../workbench/view/split-view/types';
import { WorkspaceService } from '../../workspace';
import { AppSidebarService } from '../services/app-sidebar';
import * as styles from './fallback.css';
import {
  hoverNavWrapperStyle,
  navBodyStyle,
  navHeaderStyle,
  navStyle,
  navWrapperStyle,
  resizeHandleShortcutStyle,
  sidebarFloatMaskStyle,
} from './index.css';
import { SidebarHeader } from './sidebar-header';

export type History = {
  stack: string[];
  current: number;
};

const MAX_WIDTH = 480;
const MIN_WIDTH = 248;
const isMacosDesktop = BUILD_CONFIG.isElectron && environment.isMacOs;

export function AppSidebar({ children }: PropsWithChildren) {
  const { appSettings } = useAppSettingHelper();

  const clientBorder = appSettings.clientBorder;

  const appSidebarService = useService(AppSidebarService).sidebar;
  const workbenchService = useService(WorkbenchService).workbench;

  const open = useLiveData(appSidebarService.open$);
  const width = useLiveData(appSidebarService.width$);
  const smallScreenMode = useLiveData(appSidebarService.smallScreenMode$);
  const hovering = useLiveData(appSidebarService.hovering$) && open !== true;
  const resizing = useLiveData(appSidebarService.resizing$);

  const sidebarState = smallScreenMode
    ? open
      ? 'floating-with-mask'
      : 'close'
    : open
      ? 'open'
      : hovering
        ? 'floating'
        : 'close';

  const hasRightBorder = !BUILD_CONFIG.isElectron && !clientBorder;

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

  useEffect(() => {
    if (sidebarState !== 'floating' || resizing) {
      return;
    }
    const onMouseMove = (e: MouseEvent) => {
      const menuElement = document.querySelector(
        'body > [data-radix-popper-content-wrapper] > [data-radix-menu-content]'
      );

      if (menuElement) {
        return;
      }

      if (e.clientX > width + 20) {
        appSidebarService.setHovering(false);
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
    };
  }, [appSidebarService, resizing, sidebarState, width]);

  const resizeHandleDropTargetOptions = useMemo(() => {
    return () => ({
      data: () => {
        const firstView = workbenchService.views$.value.at(0);

        if (!firstView) {
          return {};
        }

        return {
          at: 'workbench:resize-handle',
          edge: 'left', // left of the first view
          viewId: firstView.id,
        };
      },
      canDrop: (data: DropTargetGetFeedback<AffineDNDData>) => {
        return (
          (!!data.source.data.entity?.type &&
            allowedSplitViewEntityTypes.has(data.source.data.entity?.type)) ||
          data.source.data.from?.at === 'workbench:link'
        );
      },
    });
  }, [workbenchService.views$.value]);

  return (
    <>
      <ResizePanel
        resizeHandleDropTargetOptions={resizeHandleDropTargetOptions}
        floating={
          sidebarState === 'floating' || sidebarState === 'floating-with-mask'
        }
        open={sidebarState !== 'close'}
        resizing={resizing}
        maxWidth={MAX_WIDTH}
        minWidth={MIN_WIDTH}
        width={width}
        resizeHandlePos="right"
        onOpen={handleOpenChange}
        onResizing={handleResizing}
        onWidthChange={handleWidthChange}
        unmountOnExit={false}
        className={clsx(navWrapperStyle, {
          [hoverNavWrapperStyle]: sidebarState === 'floating',
        })}
        resizeHandleOffset={0}
        resizeHandleVerticalPadding={clientBorder ? 16 : 0}
        resizeHandleTooltip={<ResizeHandleTooltipContent />}
        resizeHandleTooltipOptions={{
          side: 'right',
          align: 'center',
        }}
        resizeHandleTooltipShortcut={['$mod', '/']}
        resizeHandleTooltipShortcutClassName={resizeHandleShortcutStyle}
        data-transparent
        data-open={sidebarState !== 'close'}
        data-has-border={hasRightBorder}
        data-testid="app-sidebar-wrapper"
        data-is-macos-electron={isMacosDesktop}
        data-client-border={clientBorder}
        data-is-electron={BUILD_CONFIG.isElectron}
      >
        <nav className={navStyle} data-testid="app-sidebar">
          {!BUILD_CONFIG.isElectron && sidebarState !== 'floating' && (
            <SidebarHeader />
          )}
          <div className={navBodyStyle} data-testid="sliderBar-inner">
            {children}
          </div>
        </nav>
      </ResizePanel>
      <div
        data-testid="app-sidebar-float-mask"
        data-open={open}
        data-is-floating={sidebarState === 'floating-with-mask'}
        className={sidebarFloatMaskStyle}
        onClick={handleClose}
      />
    </>
  );
}

const ResizeHandleTooltipContent = () => {
  const t = useI18n();
  return (
    <div>
      <div>{t['com.affine.rootAppSidebar.resize-handle.tooltip.drag']()}</div>
      <div>{t['com.affine.rootAppSidebar.resize-handle.tooltip.click']()}</div>
    </div>
  );
};

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
        <WorkspaceNavigator showSyncStatus showEnableCloudButton dense />
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
        // oxlint-disable-next-line eslint-plugin-react(no-array-index-key)
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
export * from './open-in-app-card';
export * from './quick-search-input';
export * from './sidebar-containers';
export * from './sidebar-header';
