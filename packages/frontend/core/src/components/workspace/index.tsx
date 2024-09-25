import { useAppSettingHelper } from '@affine/core/components/hooks/affine/use-app-setting-helper';
import { AppSidebarService } from '@affine/core/modules/app-sidebar';
import {
  DocsService,
  GlobalContextService,
  useLiveData,
  useService,
} from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { clsx } from 'clsx';
import type { HTMLAttributes, PropsWithChildren, ReactElement } from 'react';
import { forwardRef, useMemo } from 'react';

import {
  appStyle,
  mainContainerStyle,
  panelWidthVar,
  toolStyle,
} from './index.css';

export type WorkspaceRootProps = PropsWithChildren<{
  className?: string;
  useNoisyBackground?: boolean;
  useBlurBackground?: boolean;
}>;

export const AppContainer = ({
  useNoisyBackground,
  useBlurBackground,
  children,
  className,
  ...rest
}: WorkspaceRootProps) => {
  const noisyBackground = BUILD_CONFIG.isElectron && useNoisyBackground;
  const blurBackground =
    BUILD_CONFIG.isElectron && environment.isMacOs && useBlurBackground;
  return (
    <div
      {...rest}
      className={clsx(appStyle, className, {
        'noisy-background': noisyBackground,
        'blur-background': blurBackground,
      })}
      data-noise-background={noisyBackground}
      data-blur-background={blurBackground}
    >
      {children}
    </div>
  );
};

export interface MainContainerProps extends HTMLAttributes<HTMLDivElement> {}

export const MainContainer = forwardRef<
  HTMLDivElement,
  PropsWithChildren<MainContainerProps>
>(function MainContainer(
  { className, children, style, ...props },
  ref
): ReactElement {
  const appSidebarService = useService(AppSidebarService).sidebar;
  const appSideBarOpen = useLiveData(appSidebarService.open$);
  const appSidebarHoverFloating = useLiveData(appSidebarService.hoverFloating$);
  const appSideBarWidth = useLiveData(appSidebarService.width$);

  const showAppSideBarPinAnimation = useLiveData(
    appSidebarService.showFloatToPinAnimation$
  );
  const { appSettings } = useAppSettingHelper();

  const combinedStyle = useMemo(() => {
    const dynamicStyle = assignInlineVars({
      [panelWidthVar]: `${appSideBarWidth}px`,
    });
    return {
      ...style,
      ...dynamicStyle,
    };
  }, [appSideBarWidth, style]);

  return (
    <div
      {...props}
      style={combinedStyle}
      className={clsx(mainContainerStyle, className)}
      data-is-desktop={BUILD_CONFIG.isElectron}
      data-transparent={false}
      data-client-border={appSettings.clientBorder}
      data-side-bar-open={appSideBarOpen}
      data-side-bar-floating={appSidebarHoverFloating}
      data-show-pin-sidebar-animation={showAppSideBarPinAnimation}
      data-testid="main-container"
      ref={ref}
    >
      <div className={mainContainerStyle}>{children}</div>
    </div>
  );
});

MainContainer.displayName = 'MainContainer';

export const MainContainerFallback = ({ children }: PropsWithChildren) => {
  // todo: default app fallback?
  return <MainContainer>{children}</MainContainer>;
};

export const ToolContainer = (
  props: PropsWithChildren<{ className?: string }>
): ReactElement => {
  const docId = useLiveData(
    useService(GlobalContextService).globalContext.docId.$
  );
  const docRecordList = useService(DocsService).list;
  const doc = useLiveData(docId ? docRecordList.doc$(docId) : undefined);
  const inTrash = useLiveData(doc?.meta$)?.trash;
  return (
    <div className={clsx(toolStyle, { trash: inTrash }, props.className)}>
      {props.children}
    </div>
  );
};
