/**
 * # View Islands
 *
 * This file defines some components that allow each UI area to be defined inside each View route as shown below,
 * and the Workbench is responsible for rendering these areas into their containers.
 *
 * ```tsx
 * const MyView = () => {
 *   return <>
 *     <ViewHeader>
 *       ...
 *     </ViewHeader>
 *     <ViewBody>
 *       ...
 *     </ViewBody>
 *     <ViewSidebarTab tabId="my-tab" icon={<MyIcon />}>
 *       ...
 *     </ViewSidebarTab>
 *   </>
 * }
 *
 * const viewRoute = [
 *   {
 *     path: '/my-view',
 *     component: MyView,
 *   }
 * ]
 * ```
 *
 * Each Island is divided into `Target` and `Provider`.
 * The `Provider` wraps the content to be rendered, while the `Target` is placed where it needs to be rendered.
 * Then you get a view portal.
 */

import { createIsland, type Island } from '@affine/core/utils/island';
import { useLiveData, useService } from '@toeverything/infra';
import type React from 'react';
import {
  createContext,
  forwardRef,
  type Ref,
  useContext,
  useEffect,
  useState,
} from 'react';

import { ViewService } from '../services/view';
import { WorkbenchService } from '../services/workbench';

interface ViewIslandRegistry {
  [key: string]: Island | undefined;
}

/**
 * A registry context will be placed at the top level of the workbench.
 *
 * The `View` will create islands and place them in the registry,
 * while `Workbench` can use the KEY to retrieve and display the islands.
 */
const ViewIslandRegistryContext = createContext<ViewIslandRegistry>({});
const ViewIslandSetContext = createContext<React.Dispatch<
  React.SetStateAction<ViewIslandRegistry>
> | null>(null);

const ViewIsland = ({
  id,
  children,
}: React.PropsWithChildren<{ id: string }>) => {
  const setter = useContext(ViewIslandSetContext);

  if (!setter) {
    throw new Error(
      'ViewIslandProvider must be used inside ViewIslandRegistryProvider'
    );
  }

  const [island] = useState<Island>(createIsland);

  useEffect(() => {
    setter(prev => ({ ...prev, [id]: island }));

    return () => {
      setter(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };
  }, [id, island, setter]);

  return <island.Provider>{children}</island.Provider>;
};

const ViewIslandTarget = forwardRef(function ViewIslandTarget(
  {
    id,
    children,
    ...otherProps
  }: { id: string } & React.HTMLProps<HTMLDivElement>,
  ref: Ref<HTMLDivElement>
) {
  const island = useContext(ViewIslandRegistryContext)[id];
  if (!island) {
    return <div ref={ref} {...otherProps} />;
  }

  return (
    <island.Target ref={ref} {...otherProps}>
      {children}
    </island.Target>
  );
});

export const ViewIslandRegistryProvider = ({
  children,
}: React.PropsWithChildren) => {
  const [contextValue, setContextValue] = useState<ViewIslandRegistry>({});

  return (
    <ViewIslandRegistryContext.Provider value={contextValue}>
      <ViewIslandSetContext.Provider value={setContextValue}>
        {children}
      </ViewIslandSetContext.Provider>
    </ViewIslandRegistryContext.Provider>
  );
};

export const ViewBody = ({ children }: React.PropsWithChildren) => {
  const view = useService(ViewService).view;

  return <ViewIsland id={`${view.id}:body`}>{children}</ViewIsland>;
};

export const ViewBodyTarget = forwardRef(function ViewBodyTarget(
  {
    viewId,
    ...otherProps
  }: React.HTMLProps<HTMLDivElement> & { viewId: string },
  ref: React.ForwardedRef<HTMLDivElement>
) {
  return <ViewIslandTarget id={`${viewId}:body`} {...otherProps} ref={ref} />;
});

export const ViewHeader = ({ children }: React.PropsWithChildren) => {
  const view = useService(ViewService).view;

  return <ViewIsland id={`${view.id}:header`}>{children}</ViewIsland>;
};

export const ViewHeaderTarget = forwardRef(function ViewHeaderTarget(
  {
    viewId,
    ...otherProps
  }: React.HTMLProps<HTMLDivElement> & { viewId: string },
  ref: React.ForwardedRef<HTMLDivElement>
) {
  return <ViewIslandTarget id={`${viewId}:header`} {...otherProps} ref={ref} />;
});

export const ViewSidebarTab = ({
  children,
  tabId,
  icon,
  unmountOnInactive = true,
}: React.PropsWithChildren<{
  tabId: string;
  icon: React.ReactNode;
  unmountOnInactive?: boolean;
}>) => {
  const view = useService(ViewService).view;
  const workbench = useService(WorkbenchService).workbench;
  const sidebarOpened = useLiveData(workbench.sidebarOpen$);
  const activeTab = useLiveData(view.activeSidebarTab$);

  const isActive = activeTab?.id === tabId && sidebarOpened;

  useEffect(() => {
    view.addSidebarTab(tabId);
    return () => {
      view.removeSidebarTab(tabId);
    };
  }, [tabId, view]);

  return (
    <>
      <ViewIsland id={`${view.id}:sidebar:${tabId}:icon`}>{icon}</ViewIsland>
      <ViewIsland id={`${view.id}:sidebar:${tabId}:body`}>
        {unmountOnInactive && !isActive ? null : children}
      </ViewIsland>
    </>
  );
};

export const ViewSidebarTabIconTarget = forwardRef(
  function ViewSidebarTabIconTarget(
    {
      viewId,
      tabId,
      ...otherProps
    }: React.HTMLProps<HTMLDivElement> & { tabId: string; viewId: string },
    ref: Ref<HTMLDivElement>
  ) {
    return (
      <ViewIslandTarget
        ref={ref}
        id={`${viewId}:sidebar:${tabId}:icon`}
        {...otherProps}
      />
    );
  }
);

export const ViewSidebarTabBodyTarget = forwardRef(
  function ViewSidebarTabBodyTarget(
    {
      viewId,
      tabId,
      ...otherProps
    }: React.HTMLProps<HTMLDivElement> & {
      tabId: string;
      viewId: string;
    },
    ref: Ref<HTMLDivElement>
  ) {
    return (
      <ViewIslandTarget
        ref={ref}
        id={`${viewId}:sidebar:${tabId}:body`}
        {...otherProps}
      />
    );
  }
);
