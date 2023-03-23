import { Button, toast } from '@affine/component';
import { currentAffineUserAtom } from '@affine/workspace/affine/atom';
import {
  clearLoginStorage,
  createAffineAuth,
  getLoginStorage,
  isExpired,
  parseIdToken,
  setLoginStorage,
  SignMethod,
} from '@affine/workspace/affine/login';
import { useAtom } from 'jotai';
import type { NextPage } from 'next';
import { useMemo } from 'react';

import { StyledPage, StyledWrapper } from '../../layouts/styles';

const LoginDevPage: NextPage = () => {
  const [user, setUser] = useAtom(currentAffineUserAtom);
  const auth = useMemo(() => createAffineAuth(), []);
  return (
    <StyledPage>
      <StyledWrapper>
        <h1>LoginDevPage</h1>
        <Button
          onClick={async () => {
            const storage = getLoginStorage();
            if (storage) {
              const user = parseIdToken(storage.token);
              if (isExpired(user)) {
                await auth.refreshToken(storage);
              }
            }
            const response = await auth.generateToken(SignMethod.Google);
            if (response) {
              setLoginStorage(response);
              const user = parseIdToken(response.token);
              setUser(user);
            } else {
              toast('Login failed');
            }
          }}
        >
          Login
        </Button>
        <Button
          onClick={async () => {
            const storage = getLoginStorage();
            if (!storage) {
              throw new Error('No storage');
            }
            const response = await auth.refreshToken(storage);
            if (response) {
              setLoginStorage(response);
              const user = parseIdToken(response.token);
              setUser(user);
            } else {
              toast('Login failed');
            }
          }}
        >
          Refresh Token
        </Button>
        <Button
          onClick={() => {
            clearLoginStorage();
            setUser(null);
          }}
        >
          Reset Storage
        </Button>
        {user && JSON.stringify(user)}
      </StyledWrapper>
    </StyledPage>
  );
};

export default LoginDevPage;
