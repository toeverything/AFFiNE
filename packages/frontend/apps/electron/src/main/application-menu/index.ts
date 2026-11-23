import type { MainEventRegister } from '../type';
import { applicationMenuSubjects, type NewPageAction } from './subject';

export * from './create';
export * from './subject';

/**
 * Events triggered by application menu
 */
export const applicationMenuEvents = {
  /**
   * File -> New Doc
   */
  onNewPageAction: (fn: (type: NewPageAction) => void) => {
    const sub = applicationMenuSubjects.newPageAction$.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
  // todo: properly define the active tab type
  openInSettingModal: (
    fn: (props: { activeTab: string; scrollAnchor?: string }) => void
  ) => {
    const sub = applicationMenuSubjects.openInSettingModal$.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
  onOpenJournal: (fn: () => void) => {
    const sub = applicationMenuSubjects.openJournal$.subscribe(fn);
    return () => {
      sub.unsubscribe();
    };
  },
} satisfies Record<string, MainEventRegister>;
