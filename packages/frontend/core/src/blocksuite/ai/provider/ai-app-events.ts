import type { EditorHost } from '@blocksuite/affine/std';
import { BehaviorSubject, Subject } from 'rxjs';

import type { AIChatParams, AISendParams, AIUserInfo } from './ai-provider';

export const AIAppEvents = {
  /* eslint-disable rxjs/finnish */
  requestOpenWithChat: new BehaviorSubject<AIChatParams | null>(null),
  requestSendWithChat: new BehaviorSubject<AISendParams | null>(null),
  requestInsertTemplate: new Subject<{
    template: string;
    mode: 'page' | 'edgeless';
  }>(),
  requestLogin: new Subject<{ host?: EditorHost | null }>(),
  requestUpgradePlan: new Subject<{ host?: EditorHost | null }>(),
  userInfo: new BehaviorSubject<AIUserInfo | null>(null),
  previewPanelOpenChange: new Subject<boolean>(),
  /* eslint-enable rxjs/finnish */
};
