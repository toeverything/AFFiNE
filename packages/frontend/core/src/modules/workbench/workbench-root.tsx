import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';

import { useBindWorkbenchToBrowserRouter } from './browser-adapter';
import { useBindWorkbenchToDesktopRouter } from './desktop-adapter';
import type { View } from './view';
import { ViewRoot } from './view/view-root';
import { Workbench } from './workbench';
import {
  workbenchRootContainer,
  workbenchViewContainer,
} from './workbench-root.css';

const useAdapter = environment.isDesktop
  ? useBindWorkbenchToDesktopRouter
  : useBindWorkbenchToBrowserRouter;

export const WorkbenchRoot = () => {
  const workbench = useService(Workbench);

  // for debugging
  (window as any).workbench = workbench;

  const views = useLiveData(workbench.views);

  const location = useLocation();
  const basename = location.pathname.match(/\/workspace\/[^/]+/g)?.[0] ?? '/';

  useAdapter(workbench, basename);

  return (
    <div className={workbenchRootContainer}>
      {views.map((view, index) => (
        <WorkbenchView key={view.id} view={view} index={index} />
      ))}
    </div>
  );
};

const WorkbenchView = ({ view, index }: { view: View; index: number }) => {
  const workbench = useService(Workbench);

  const handleOnFocus = useCallback(() => {
    workbench.active(index);
  }, [workbench, index]);

  return (
    <div className={workbenchViewContainer} onMouseDownCapture={handleOnFocus}>
      <ViewRoot key={view.id} view={view} />
    </div>
  );
};
