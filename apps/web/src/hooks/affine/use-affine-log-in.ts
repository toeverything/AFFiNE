import { toast } from '@affine/component';
import {
  createAffineAuth,
  setLoginStorage,
  SignMethod,
} from '@affine/workspace/affine/login';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { apis } from '../../shared/apis';

export const affineAuth = createAffineAuth();

export function useAffineLogIn() {
  const router = useRouter();
  return useCallback(async () => {
    const response = await affineAuth.generateToken(SignMethod.Google);
    if (response) {
      setLoginStorage(response);
      apis.auth.setLogin(response);
      router.reload();
    } else {
      toast('Login failed');
    }
  }, [router]);
}
