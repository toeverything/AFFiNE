import { LiveData } from '@toeverything/infra';

import type { Dialog } from './types';

export const dialogs$ = new LiveData<Record<Dialog['id'], Dialog>>({});
export const openedDialogIds$ = LiveData.computed(get =>
  Object.keys(get(dialogs$)).filter(id => get(dialogs$)[id]?.open)
);
