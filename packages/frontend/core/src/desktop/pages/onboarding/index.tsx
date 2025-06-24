import { useCallback } from 'react';

import { Onboarding } from '../../../components/affine/onboarding/onboarding';

export const Component = () => {
  const openApp = useCallback(() => {
    // todo: add back open main app when needed
  }, []);

  return <Onboarding onOpenApp={openApp} />;
};
