import { Subject } from 'rxjs';

export const uiSubjects = {
  onMaximized$: new Subject<boolean>(),
  onFullScreen$: new Subject<boolean>(),
  onToggleRightSidebar$: new Subject<string>(),
};
