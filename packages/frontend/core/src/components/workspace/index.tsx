import { useAppSettingHelper } from '@affine/core/components/hooks/affine/use-app-setting-helper';
import { AppSidebarService } from '@affine/core/modules/app-sidebar';
import {
  DocsService,
  GlobalContextService,
  useLiveData,
  useService,
} from '@toeverything/infra';
import { clsx } from 'clsx';
import type { HTMLAttributes, PropsWithChildren, ReactElement } from 'react';
import { forwardRef } from 'react';

import { appStyle, mainContainerStyle, toolStyle } from './index.css';

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
>(function MainContainer({ className, children, ...props }, ref): ReactElement {
  const appSidebarService = useService(AppSidebarService).sidebar;
  const appSideBarOpen = useLiveData(appSidebarService.open$);
  const { appSettings } = useAppSettingHelper();

  return (
    <div
      {...props}
      className={clsx(mainContainerStyle, className)}
      data-is-desktop={BUILD_CONFIG.isElectron}
      data-transparent={false}
      data-client-border={appSettings.clientBorder}
      data-side-bar-open={appSideBarOpen}
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
