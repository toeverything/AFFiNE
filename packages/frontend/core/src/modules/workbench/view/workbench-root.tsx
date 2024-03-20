import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import type { View } from '../entities/view';
import { Workbench } from '../entities/workbench';
import { useBindWorkbenchToBrowserRouter } from './browser-adapter';
import { useBindWorkbenchToDesktopRouter } from './desktop-adapter';
import { SplitView } from './split-view/split-view';
import { ViewRoot } from './view-root';
import * as styles from './workbench-root.css';

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

  const panelRenderer = useCallback((view: View, index: number) => {
    return <WorkbenchView key={view.id} view={view} index={index} />;
  }, []);

  const onMove = useCallback(
    (from: number, to: number) => {
      workbench.moveView(from, to);
    },
    [workbench]
  );

  useEffect(() => {
    workbench.basename.next(basename);
  }, [basename, workbench.basename]);

  return (
    <SplitView
      className={styles.workbenchRootContainer}
      views={views}
      renderer={panelRenderer}
      onMove={onMove}
    />
  );
};

const WorkbenchView = ({ view, index }: { view: View; index: number }) => {
  const workbench = useService(Workbench);

  const handleOnFocus = useCallback(() => {
    workbench.active(index);
  }, [workbench, index]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      const element = containerRef.current;
      element.addEventListener('mousedown', handleOnFocus, {
        capture: true,
      });
      return () => {
        element.removeEventListener('mousedown', handleOnFocus, {
          capture: true,
        });
      };
    }
    return;
  }, [handleOnFocus]);

  return (
    <div className={styles.workbenchViewContainer} ref={containerRef}>
      <ViewRoot key={view.id} view={view} />
    </div>
  );
};
