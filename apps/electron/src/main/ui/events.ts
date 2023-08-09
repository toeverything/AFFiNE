import type { MainEventRegister } from '../type';
import { uiSubjects } from './subject';

/**
 * Events triggered by application menu
 */
export const uiEvents = {
  onFinishLogin: (fn: () => void) => {
    const sub = uiSubjects.onFinishLogin.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;
