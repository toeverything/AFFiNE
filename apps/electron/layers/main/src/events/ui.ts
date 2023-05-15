import { logger } from '../logger';
import { getOrCreateAppWindow } from '../window';

// event listeners are attached to main event stream which are exposed as Observables
export const uiEvents = {
  onTabsUpdated: (fn: (tabs: string[]) => void) => {
    const window = getOrCreateAppWindow();
    const unsub = window.viewIds$.subscribe(ids => {
      logger.info('tabs updated', ids);
      fn(ids);
    });
    return () => {
      unsub.unsubscribe();
    };
  },
  onActiveTabChanged: (fn: (tab: string) => void) => {
    const window = getOrCreateAppWindow();
    const unsub = window.activeViewId$.subscribe(id => {
      fn(id);
    });
    return () => {
      unsub.unsubscribe();
    };
  },
};
