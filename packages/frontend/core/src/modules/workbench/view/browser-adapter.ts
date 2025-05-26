import { useAsyncNavigate } from '@affine/core/utils';
import { useLiveData } from '@toeverything/infra';
import type { Location } from 'history';
import { useEffect } from 'react';
import { useLocation } from 'react-router';

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
  const navigate = useAsyncNavigate();
  const browserLocation = useLocation();

  const view = useLiveData(workbench.activeView$);

  useEffect(() => {
    return view.history.listen(update => {
      if (update.action === 'POP') {
        // This is because the history of view and browser are two different stacks,
        // the POP action cannot be synchronized.
        return;
      }

      const newBrowserLocation = viewLocationToBrowserLocation(
        update.location,
        basename
      );

      navigate(newBrowserLocation, {
        state: 'fromView,' + newBrowserLocation.key,
        replace:
          update.action === 'REPLACE' ||
          newBrowserLocation.state === 'fromBrowser',
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
    if (
      typeof newLocation.state === 'string' &&
      newLocation.state.startsWith('fromView')
    ) {
      const fromViewKey = newLocation.state.substring('fromView,'.length);
      if (fromViewKey === view.location$.value.key) {
        return;
      } else {
        const target = view.history.entries.findIndex(
          entry => entry.key === fromViewKey
        );
        if (target !== -1) {
          const now = view.history.index;
          const delta = target - now;
          view.history.go(delta);
          return;
        }
      }
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
