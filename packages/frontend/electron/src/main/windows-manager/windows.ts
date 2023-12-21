import type { BrowserWindow } from 'electron';

import type { LaunchStage } from './types';

export const windows$: Record<LaunchStage, Promise<BrowserWindow> | undefined> =
  {
    main: undefined,
    onboarding: undefined,
  };
