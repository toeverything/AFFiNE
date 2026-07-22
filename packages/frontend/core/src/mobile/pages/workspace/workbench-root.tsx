import {
  useBindWorkbenchToBrowserRouter,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { ViewRoot } from '@affine/core/modules/workbench/view/view-root';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { FrameworkScope, useLiveData, useService } from '@toeverything/infra';
import {
  type PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import * as React from 'react';
import { type RouteObject, useLocation } from 'react-router-dom';

import {
  isMobileRootDestination,
  MobileBackCoordinator,
  type MobileDestinationKind,
} from '../../modules/back-coordinator';
import { Component as Home } from './home';

const Activity = Reflect.get(React, 'Activity') as React.ComponentType<
  PropsWithChildren<{ mode: 'visible' | 'hidden' }>
>;

declare global {
  interface WindowEventMap {
    'affine:memory-pressure': Event;
  }
}

const destinationKind = (pathname: string): MobileDestinationKind => {
  if (pathname === '/home') return 'home';
  if (pathname === '/all') return 'all-docs';
  if (pathname === '/collection') return 'all-collections';
  if (pathname === '/tag') return 'all-tags';
  if (pathname === '/journals') return 'journal';
  if (pathname === '/search') return 'search';
  if (pathname.startsWith('/collection/')) return 'collection';
  if (pathname.startsWith('/tag/')) return 'tag';
  return 'doc';
};

export const MobileWorkbenchRoot = ({ routes }: { routes: RouteObject[] }) => {
  const workbench = useService(WorkbenchService).workbench;
  const workspaceId = useService(WorkspaceService).workspace.id;

  const views = useLiveData(workbench.views$);
  const view = views[0];
  const viewLocation = useLiveData(view.location$);
  const backCoordinator = useService(MobileBackCoordinator);
  const isHome = viewLocation.pathname === '/home';
  const [homeCache, setHomeCache] = useState({ workspaceId, cached: isHome });
  const homeCached =
    homeCache.workspaceId === workspaceId ? homeCache.cached : isHome;
  const homeRootRef = useRef<HTMLDivElement>(null);
  const previousLocation = useRef({
    index: view.history.index,
    location: `${viewLocation.pathname}${viewLocation.search}${viewLocation.hash}`,
    kind: destinationKind(viewLocation.pathname),
  });

  const location = useLocation();
  const basename = location.pathname.match(/\/workspace\/[^/]+/g)?.[0] ?? '/';

  useBindWorkbenchToBrowserRouter(workbench, basename);

  useEffect(() => {
    workbench.updateBasename(basename);
  }, [basename, workbench]);

  useEffect(() => {
    const kind = destinationKind(viewLocation.pathname);
    const currentLocation = `${viewLocation.pathname}${viewLocation.search}${viewLocation.hash}`;
    const previous = previousLocation.current;
    const index = view.history.index;
    if (index > previous.index && !isMobileRootDestination(kind)) {
      backCoordinator.pushSource({
        workspaceId,
        location: previous.location,
        restoration:
          previous.kind === 'home'
            ? backCoordinator.snapshot('home')
            : undefined,
      });
    } else if (index < previous.index) {
      backCoordinator.discardSources(previous.index - index);
    }
    if (
      isMobileRootDestination(kind) &&
      previous.location !== currentLocation
    ) {
      backCoordinator.discardSources();
    }
    previousLocation.current = {
      index,
      location: currentLocation,
      kind,
    };
    const canGoBack = backCoordinator.hasSource(workspaceId);
    backCoordinator.setDestination({
      kind,
      back: canGoBack
        ? () => {
            const source = backCoordinator.popSource(workspaceId);
            if (!source) return false;
            view.replace(source.location);
            return true;
          }
        : undefined,
      up: () => view.replace('/home'),
    });
  }, [backCoordinator, view, viewLocation, workspaceId]);

  useEffect(() => {
    setHomeCache(current => {
      if (current.workspaceId !== workspaceId) {
        return { workspaceId, cached: isHome };
      }
      return isHome && !current.cached
        ? { workspaceId, cached: true }
        : current;
    });
  }, [isHome, workspaceId]);

  useLayoutEffect(() => {
    if (
      !isHome &&
      document.activeElement instanceof HTMLElement &&
      homeRootRef.current?.contains(document.activeElement)
    ) {
      document.activeElement.blur();
    }
  }, [isHome]);

  useEffect(() => {
    const evict = () => {
      if (!isHome) setHomeCache({ workspaceId, cached: false });
    };
    window.addEventListener('affine:memory-pressure', evict);
    return () => window.removeEventListener('affine:memory-pressure', evict);
  }, [isHome, workspaceId]);

  const root = (
    <>
      {(homeCached || isHome) && (
        <Activity key={workspaceId} mode={isHome ? 'visible' : 'hidden'}>
          <FrameworkScope scope={view.scope}>
            <div ref={homeRootRef}>
              <Home />
            </div>
          </FrameworkScope>
        </Activity>
      )}
      {!isHome && <ViewRoot routes={routes} view={view} />}
    </>
  );
  return root;
};
