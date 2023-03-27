import { currentAffineUserAtom } from '@affine/workspace/affine/atom';
import {
  createAffineAuth,
  parseIdToken,
  setLoginStorage,
  SignMethod,
} from '@affine/workspace/affine/login';
import { useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { toast } from '../../utils';

export const affineAuth = createAffineAuth();

export function useAffineLogIn() {
  const router = useRouter();
  const setUser = useSetAtom(currentAffineUserAtom);
  return useCallback(async () => {
    const response = await affineAuth.generateToken(SignMethod.Google);
    if (response) {
      setLoginStorage(response);
      const user = parseIdToken(response.token);
      setUser(user);
      router.reload();
    } else {
      toast('Login failed');
    }
  }, [router, setUser]);
}
