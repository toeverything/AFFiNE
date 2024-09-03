import { Subject } from 'rxjs';

import type { AuthenticationRequest } from '../windows-manager';

export const uiSubjects = {
  onMaximized$: new Subject<boolean>(),
  onFullScreen$: new Subject<boolean>(),
  onToggleRightSidebar$: new Subject<string>(),
  authenticationRequest$: new Subject<AuthenticationRequest>(),
};
