import type { MainEventRegister } from '../type';
import { uiSubjects } from './subject';

/**
 * Events triggered by application menu
 */
export const uiEvents = {
  onMaximized: (fn: (maximized: boolean) => void) => {
    const sub = uiSubjects.onMaximized.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;
