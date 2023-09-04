import type { MainEventRegister } from '../type';
import { uiSubjects } from './subject';

/**
 * Events triggered by application menu
 */
export const uiEvents = {
  onFinishLogin: (
    fn: (result: { success: boolean; email?: string }) => void
  ) => {
    const sub = uiSubjects.onFinishLogin.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
  onStartLogin: (fn: (opts: { email?: string }) => void) => {
    const sub = uiSubjects.onStartLogin.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;
