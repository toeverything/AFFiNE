import { clsx } from 'clsx';
import type { HTMLAttributes, PropsWithChildren, ReactElement } from 'react';
import { forwardRef } from 'react';

import { AppSidebarFallback } from '../app-sidebar';
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

export const MainContainer = forwardRef<
  HTMLDivElement,
  PropsWithChildren<MainContainerProps>
>(function MainContainer(
  { className, padding, children, ...props },
  ref
): ReactElement {
  return (
    <div
      {...props}
      className={clsx(mainContainerStyle, className)}
      data-is-macos={environment.isDesktop && environment.isMacOs}
      data-show-padding={!!padding}
      ref={ref}
    >
      {children}
    </div>
  );
});

MainContainer.displayName = 'MainContainer';

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
