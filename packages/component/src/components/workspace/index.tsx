import { clsx } from 'clsx';
import type { PropsWithChildren, ReactElement } from 'react';

import { AppSidebarFallback } from '../app-sidebar';
import { appStyle, mainContainerStyle, toolStyle } from './index.css';

export type WorkspaceRootProps = PropsWithChildren<{
  resizing?: boolean;
}>;

export const AppContainer = (props: WorkspaceRootProps): ReactElement => {
  const noisyBackground = environment.isDesktop && environment.isMacOs;
  return (
    <div
      className={appStyle}
      data-noise-background={noisyBackground}
      data-is-resizing={props.resizing}
    >
      {props.children}
    </div>
  );
};

export type MainContainerProps = PropsWithChildren<{
  className?: string;
}>;

export const MainContainer = (props: MainContainerProps): ReactElement => {
  return (
    <div
      className={clsx(mainContainerStyle, 'main-container', props.className)}
      data-is-desktop={environment.isDesktop}
    >
      {props.children}
    </div>
  );
};

export const ToolContainer = (props: PropsWithChildren): ReactElement => {
  return <div className={toolStyle}>{props.children}</div>;
};

export const WorkspaceFallback = (): ReactElement => {
  return (
    <AppContainer>
      <AppSidebarFallback />
      <MainContainer></MainContainer>
    </AppContainer>
  );
};
