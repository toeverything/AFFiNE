import { LiveData } from '@toeverything/infra';

import type { Dialog } from './types';

export const dialogs$ = new LiveData<Record<Dialog['id'], Dialog>>({});
