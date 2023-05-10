import { clsx } from 'clsx';
import type { PropsWithChildren, ReactElement } from 'react';

import { appStyle, mainContainerStyle, toolStyle } from './index.css';

export type WorkspaceRootProps = PropsWithChildren<{
  resizing?: boolean;
}>;

export const AppContainer = (props: WorkspaceRootProps): ReactElement => {
  return (
    <div className={appStyle} data-is-resizing={props.resizing}>
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
    >
      {props.children}
    </div>
  );
};

export const ToolContainer = (props: PropsWithChildren): ReactElement => {
  return <div className={toolStyle}>{props.children}</div>;
};
