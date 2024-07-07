import type { MainEventRegister } from '../type';
import {
  onOpenInSplitView,
  onSeparateView,
  onTabViewsMetaChanged,
} from '../windows-manager';
import { uiSubjects } from './subject';

/**
 * Events triggered by application menu
 */
export const uiEvents = {
  onMaximized: (fn: (maximized: boolean) => void) => {
    const sub = uiSubjects.onMaximized$.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
  onFullScreen: (fn: (fullScreen: boolean) => void) => {
    const sub = uiSubjects.onFullScreen$.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
  onTabViewsMetaChanged,
  onSeparateView,
  onOpenInSplitView,
} satisfies Record<string, MainEventRegister>;
