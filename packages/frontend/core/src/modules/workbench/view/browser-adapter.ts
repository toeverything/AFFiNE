import { useLiveData } from '@toeverything/infra/livedata';
import { type Location } from 'history';
import { useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useLocation, useNavigate } from 'react-router-dom';

import type { Workbench } from '../entities/workbench';

/**
 * This hook binds the workbench to the browser router.
 * It listens to the active view and updates the browser location accordingly.
 * It also listens to the browser location and updates the active view accordingly.
 *
 * The history of the active view and the browser are two different stacks.
 *
 * In the browser, we use browser history as the criterion, and view history is not very important.
 * So our synchronization strategy is as follows:
 *
 * 1. When the active view history changed, we update the browser history, based on the update action.
 *    - If the update action is PUSH, we navigate to the new location.
 *    - If the update action is REPLACE, we replace the current location.
 * 2. When the browser location changed, we update the active view history just in PUSH action.
 * 3. To avoid infinite loop, we add a state to the location to indicate the source of the change.
 */
export function useBindWorkbenchToBrowserRouter(
  workbench: Workbench,
  basename: string
) {
  const navigate = useNavigate();
  const browserLocation = useLocation();

  const view = useLiveData(workbench.activeView);

  useEffect(() => {
    return view.history.listen(update => {
      if (update.action === 'POP') {
        // This is because the history of view and browser are two different stacks,
        // the POP action cannot be synchronized.
        throw new Error('POP view history is not allowed on browser');
      }

      if (update.location.state === 'fromBrowser') {
        return;
      }

      const newBrowserLocation = viewLocationToBrowserLocation(
        update.location,
        basename
      );

      if (locationIsEqual(browserLocation, newBrowserLocation)) {
        return;
      }

      navigate(newBrowserLocation, {
        state: 'fromView',
        replace: update.action === 'REPLACE',
      });
    });
  }, [basename, browserLocation, navigate, view]);

  useEffect(() => {
    const newLocation = browserLocationToViewLocation(
      browserLocation,
      basename
    );
    if (newLocation === null) {
      return;
    }

    view.history.push(newLocation, 'fromBrowser');
  }, [basename, browserLocation, view]);
}

function browserLocationToViewLocation(
  location: Location,
  basename: string
): Location | null {
  if (!location.pathname.startsWith(basename)) {
    return null;
  }
  return {
    ...location,
    pathname: location.pathname.slice(basename.length),
  };
}

function viewLocationToBrowserLocation(
  location: Location,
  basename: string
): Location {
  return {
    ...location,
    pathname: `${basename}${location.pathname}`,
  };
}

function locationIsEqual(a: Location, b: Location) {
  return (
    a.hash === b.hash &&
    a.pathname === b.pathname &&
    a.search === b.search &&
    a.state === b.state
  );
}
