import { clsx } from 'clsx';
import type {
  HTMLAttributes,
  PropsWithChildren,
  ReactElement,
  ReactNode,
} from 'react';

import { AppSidebarFallback } from '../app-sidebar';
import { appStyle, mainContainerStyle, toolStyle } from './index.css';

export interface WorkspaceRootProps {
  resizing?: boolean;
  useNoisyBackground?: boolean;
  useBlurBackground?: boolean;
  children: ReactNode;
}

export const AppContainer = ({
  resizing,
  useNoisyBackground,
  useBlurBackground,
  children,
}: WorkspaceRootProps) => {
  const noisyBackground = useNoisyBackground && environment.isDesktop;
  return (
    <div
      className={clsx(appStyle, {
        'noisy-background': noisyBackground,
        'blur-background': environment.isDesktop && useBlurBackground,
      })}
      data-noise-background={noisyBackground}
      data-is-resizing={resizing}
    >
      {children}
    </div>
  );
};

export interface MainContainerProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  padding?: boolean;
}

export const MainContainer = ({
  className,
  padding,
  children,
  ...props
}: PropsWithChildren<MainContainerProps>): ReactElement => {
  return (
    <div
      {...props}
      className={clsx(mainContainerStyle, 'main-container', className)}
      data-is-macos={environment.isDesktop && environment.isMacOs}
      data-show-padding={padding}
    >
      {children}
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
      <MainContainer />
    </AppContainer>
  );
};
