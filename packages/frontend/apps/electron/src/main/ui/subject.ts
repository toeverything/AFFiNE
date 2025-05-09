import { Subject } from 'rxjs';

import type { AuthenticationRequest } from '../windows-manager';

export const uiSubjects = {
  onMaximized$: new Subject<boolean>(),
  onFullScreen$: new Subject<boolean>(),
  onToggleRightSidebar$: new Subject<string>(),
  tabGoToRequest$: new Subject<{ tabId: string; to: string }>(),
  authenticationRequest$: new Subject<AuthenticationRequest>(),
  // via menu -> close view (CMD+W)
  onCloseView$: new Subject<void>(),
};
