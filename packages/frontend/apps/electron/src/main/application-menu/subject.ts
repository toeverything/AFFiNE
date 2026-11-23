import { Subject } from 'rxjs';

export type NewPageAction = 'page' | 'edgeless' | 'default';

export const applicationMenuSubjects = {
  newPageAction$: new Subject<NewPageAction>(),
  openJournal$: new Subject<void>(),
  openInSettingModal$: new Subject<{
    activeTab: string;
    scrollAnchor?: string;
  }>(),
};
