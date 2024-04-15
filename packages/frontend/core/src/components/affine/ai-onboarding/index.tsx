import { Suspense, useCallback, useState } from 'react';

import { AIOnboardingEdgeless } from './edgeless.dialog';
import { AIOnboardingGeneral } from './general.dialog';
import { AIOnboardingLocal } from './local.dialog';
import { AIOnboardingType } from './type';

const useDismiss = (key: AIOnboardingType) => {
  const [dismiss, setDismiss] = useState(localStorage.getItem(key) === 'true');

  const onDismiss = useCallback(() => {
    setDismiss(true);
    localStorage.setItem(key, 'true');
  }, [key]);

  return [dismiss, onDismiss] as const;
};

export const AIOnboarding = () => {
  const [dismissGeneral, onDismissGeneral] = useDismiss(
    AIOnboardingType.GENERAL
  );
  const [dismissEdgeless, onDismissEdgeless] = useDismiss(
    AIOnboardingType.EDGELESS
  );
  const [dismissLocal, onDismissLocal] = useDismiss(AIOnboardingType.LOCAL);

  return (
    <Suspense>
      {dismissGeneral ? null : (
        <AIOnboardingGeneral onDismiss={onDismissGeneral} />
      )}
      {dismissEdgeless ? null : (
        <AIOnboardingEdgeless onDismiss={onDismissEdgeless} />
      )}
      {dismissLocal ? null : <AIOnboardingLocal onDismiss={onDismissLocal} />}
    </Suspense>
  );
};
