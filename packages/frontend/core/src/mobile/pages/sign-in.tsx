import { useAsyncNavigate } from '@affine/core/utils';
import { useCallback } from 'react';

import { MobileSignInPanel } from '../components/sign-in';

export const Component = () => {
  const navigate = useAsyncNavigate();
  const onClose = useCallback(() => {
    navigate('/');
  }, [navigate]);

  return <MobileSignInPanel onClose={onClose} />;
};
