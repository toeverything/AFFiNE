import { Suspense, useCallback, useEffect, useState } from 'react';

import { AIOnboardingEdgeless } from './edgeless.dialog';
import { AIOnboardingGeneral } from './general.dialog';
import { AIOnboardingLocal } from './local.dialog';
import { AIOnboardingType } from './type';

const useDismiss = (key: AIOnboardingType) => {
  const [dismiss, setDismiss] = useState(localStorage.getItem(key) === 'true');

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== key) return;
      setDismiss(localStorage.getItem(key) === 'true');
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [key]);

  const onDismiss = useCallback(() => {
    setDismiss(true);
    localStorage.setItem(key, 'true');
  }, [key]);

  return [dismiss, onDismiss] as const;
};

export const WorkspaceAIOnboarding = () => {
  const [dismissGeneral] = useDismiss(AIOnboardingType.GENERAL);
  const [dismissLocal] = useDismiss(AIOnboardingType.LOCAL);

  return (
    <Suspense>
      {dismissGeneral ? null : <AIOnboardingGeneral />}
      {dismissLocal ? null : <AIOnboardingLocal />}
    </Suspense>
  );
};

export const PageAIOnboarding = () => {
  const [dismissEdgeless] = useDismiss(AIOnboardingType.EDGELESS);

  return (
    <Suspense>{dismissEdgeless ? null : <AIOnboardingEdgeless />}</Suspense>
  );
};
