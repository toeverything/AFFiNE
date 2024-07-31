import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import {
  DocsService,
  GlobalContextService,
  useLiveData,
  useService,
} from '@toeverything/infra';
import { clsx } from 'clsx';
import { useAtomValue } from 'jotai';
import type { HTMLAttributes, PropsWithChildren, ReactElement } from 'react';
import { forwardRef } from 'react';

import { appSidebarOpenAtom } from '../app-sidebar';
import { appStyle, mainContainerStyle, toolStyle } from './index.css';

export type WorkspaceRootProps = PropsWithChildren<{
  resizing?: boolean;
  useNoisyBackground?: boolean;
  useBlurBackground?: boolean;
}>;

export const AppContainer = ({
  resizing,
  useNoisyBackground,
  useBlurBackground,
  children,
  ...rest
}: WorkspaceRootProps) => {
  const noisyBackground = useNoisyBackground && environment.isDesktop;
  const blurBackground = environment.isDesktop && useBlurBackground;
  return (
    <div
      {...rest}
      className={clsx(appStyle, {
        'noisy-background': noisyBackground,
        'blur-background': blurBackground,
      })}
      data-noise-background={noisyBackground}
      data-is-resizing={resizing}
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
  const appSideBarOpen = useAtomValue(appSidebarOpenAtom);
  const { appSettings } = useAppSettingHelper();

  return (
    <div
      {...props}
      className={clsx(mainContainerStyle, className)}
      data-is-desktop={environment.isDesktop}
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
