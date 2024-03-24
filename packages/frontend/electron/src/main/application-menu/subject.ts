import { Subject } from 'rxjs';

export const applicationMenuSubjects = {
  newPageAction$: new Subject<void>(),
  openAboutPageInSettingModal$: new Subject<void>(),
};
