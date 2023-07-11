import { clsx } from 'clsx';
import type { FC, PropsWithChildren, ReactElement } from 'react';

import { AppSidebarFallback } from '../app-sidebar';
import { appStyle, mainContainerStyle, toolStyle } from './index.css';

export type WorkspaceRootProps = PropsWithChildren<{
  resizing?: boolean;
  useNoisyBackground?: boolean;
  useBlurBackground?: boolean;
}>;

export const AppContainer: FC<WorkspaceRootProps> = ({
  resizing,
  useNoisyBackground,
  useBlurBackground,
  children,
}) => {
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

export type MainContainerProps = PropsWithChildren<{
  className?: string;
  padding?: boolean;
}> &
  React.HTMLAttributes<HTMLDivElement>;

export const MainContainer = ({
  className,
  padding,
  children,
  ...props
}: MainContainerProps): ReactElement => {
  return (
    <div
      {...props}
      className={clsx(mainContainerStyle, 'main-container', className)}
      data-is-macos={environment.isBrowser && environment.isMacOs}
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
