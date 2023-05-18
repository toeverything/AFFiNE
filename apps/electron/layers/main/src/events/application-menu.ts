import { Subject } from 'rxjs';

import type { MainEventListener } from './type';

export const applicationMenuSubjects = {
  // fixme:
  //  in macOS, window might be not created yet,
  //  new page action should be queued
  newPageAction: new Subject<void>(),
};

/**
 * Events triggered by application menu
 */
export const applicationMenuEvents = {
  /**
   * File -> New Page
   * Dock -> New Page
   */
  onNewPageAction: (fn: () => void) => {
    const sub = applicationMenuSubjects.newPageAction.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventListener>;
