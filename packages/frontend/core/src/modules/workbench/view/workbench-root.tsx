import { appSettingAtom } from '@toeverything/infra/atom';
import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import type { View } from '../entities/view';
import { Workbench } from '../entities/workbench';
import { useBindWorkbenchToBrowserRouter } from './browser-adapter';
import { useBindWorkbenchToDesktopRouter } from './desktop-adapter';
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

  const { clientBorder } = useAtomValue(appSettingAtom);

  return (
    <div
      className={styles.workbenchRootContainer}
      data-client-border={!!clientBorder}
    >
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
