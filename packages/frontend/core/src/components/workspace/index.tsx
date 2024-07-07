import { observeResize } from '@affine/component';
import { apis, appInfo } from '@affine/electron-api';
import {
  DocsService,
  GlobalContextService,
  useLiveData,
  useService,
} from '@toeverything/infra';
import { clsx } from 'clsx';
import { useAtomValue } from 'jotai';
import type { HTMLAttributes, PropsWithChildren, ReactElement } from 'react';
import { forwardRef, useEffect, useRef } from 'react';

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
  return (
    <div
      {...rest}
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
  clientBorder?: boolean;
}

export const MainContainer = forwardRef<
  HTMLDivElement,
  PropsWithChildren<MainContainerProps>
>(function MainContainer(
  { className, children, clientBorder, ...props },
  ref
): ReactElement {
  const appSideBarOpen = useAtomValue(appSidebarOpenAtom);
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tabsRef.current) {
      return observeResize(tabsRef.current, () => {
        if (appInfo?.tabViewKey && apis?.ui.isActiveTab(appInfo?.tabViewKey)) {
          const rect = tabsRef.current?.getBoundingClientRect();
          if (!rect) {
            return;
          }
          const toInt = (value: number) => Math.round(value);
          apis?.ui
            .updateTabsBoundingRect({
              height: toInt(rect.height),
              width: toInt(rect.width),
              x: toInt(rect.x),
              y: toInt(rect.y),
            })
            .catch(console.error);
        }
      });
    }
    return;
  });

  return (
    <div
      {...props}
      className={clsx(mainContainerStyle, className)}
      data-is-macos={environment.isDesktop && environment.isMacOs}
      data-transparent={false}
      data-client-border={clientBorder}
      data-side-bar-open={appSideBarOpen}
      data-testid="main-container"
      ref={ref}
    >
      {children}
    </div>
  );
});

MainContainer.displayName = 'MainContainer';

export const ToolContainer = (props: PropsWithChildren): ReactElement => {
  const docId = useLiveData(
    useService(GlobalContextService).globalContext.docId.$
  );
  const docRecordList = useService(DocsService).list;
  const doc = useLiveData(docId ? docRecordList.doc$(docId) : undefined);
  const inTrash = useLiveData(doc?.meta$)?.trash;
  return (
    <div
      className={clsx(toolStyle, {
        trash: inTrash,
      })}
    >
      {props.children}
    </div>
  );
};
