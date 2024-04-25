import { LiveData } from '@toeverything/infra';

// to share the state between general & edgeless dialog,
// so that we can avoid showing edgeless dialog when general dialog is opened
export const showAIOnboardingGeneral$ = new LiveData(false);

// avoid notifying multiple times
export const edgelessNotifyId$ = new LiveData<string | number | undefined>(
  undefined
);

export const localNotifyId$ = new LiveData<string | number | undefined>(
  undefined
);
