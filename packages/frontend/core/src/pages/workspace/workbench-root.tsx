import {
  useBindWorkbenchToBrowserRouter,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { ViewRoot } from '@affine/core/modules/workbench/view/view-root';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';
import { type RouteObject, useLocation } from 'react-router-dom';

export const MobileWorkbenchRoot = ({ routes }: { routes: RouteObject[] }) => {
  const workbench = useService(WorkbenchService).workbench;

  // for debugging
  (window as any).workbench = workbench;

  const views = useLiveData(workbench.views$);

  const location = useLocation();
  const basename = location.pathname.match(/\/workspace\/[^/]+/g)?.[0] ?? '/';

  useBindWorkbenchToBrowserRouter(workbench, basename);

  useEffect(() => {
    workbench.updateBasename(basename);
  }, [basename, workbench]);

  return <ViewRoot routes={routes} view={views[0]} />;
};
