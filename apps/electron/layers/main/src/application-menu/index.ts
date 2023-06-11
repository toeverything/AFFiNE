import type { MainEventRegister } from '../type';
import { applicationMenuSubjects } from './subject';

export * from './create';
export * from './subject';

/**
 * Events triggered by application menu
 */
export const applicationMenuEvents = {
  /**
   * File -> New Page
   */
  onNewPageAction: (fn: () => void) => {
    const sub = applicationMenuSubjects.newPageAction.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;
