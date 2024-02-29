import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { memo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

import { useBindWorkbenchToBrowserRouter } from './browser-adapter';
import { useBindWorkbenchToDesktopRouter } from './desktop-adapter';
import { SplitView } from './split-view';
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

  const handleOnFocus = useCallback(
    (view: View) => {
      const index = workbench.views.value.indexOf(view);
      workbench.active(index);
    },
    [workbench]
  );

  const panelRenderer = useCallback(
    (view: View) => {
      return (
        <WorkbenchView onFocus={handleOnFocus} key={view.id} view={view} />
      );
    },
    [handleOnFocus]
  );

  const onMove = useCallback(
    (from: number, to: number) => {
      workbench.moveView(from, to);
    },
    [workbench]
  );

  return (
    <SplitView
      className={workbenchRootContainer}
      views={views}
      renderer={panelRenderer}
      onMove={onMove}
    />
  );
};

const WorkbenchView = memo(function WorkbenchView({
  view,
  onFocus,
}: {
  view: View;
  onFocus?: (view: View) => void;
}) {
  const handleMouseDownCapture = useCallback(() => {
    onFocus?.(view);
  }, [onFocus, view]);

  return (
    <div
      className={workbenchViewContainer}
      onMouseDownCapture={handleMouseDownCapture}
    >
      <ViewRoot key={view.id} view={view} />
    </div>
  );
});
