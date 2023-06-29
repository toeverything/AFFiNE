import { Button } from '@affine/component';
import { MainContainer } from '@affine/component/workspace';
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
import { lazy, Suspense, useMemo } from 'react';

import { AppContainer } from '../../components/affine/app-container';
import { toast } from '../../utils';

const Viewer = lazy(() =>
  import('@rich-data/viewer').then(m => ({ default: m.JsonViewer }))
);

import { useTheme } from 'next-themes';

const LoginDevPage: NextPage = () => {
  const [user, setUser] = useAtom(currentAffineUserAtom);
  const auth = useMemo(() => createAffineAuth(), []);
  return (
    <AppContainer>
      <MainContainer>
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
        <Button
          onClick={async () => {
            const status = await fetch('/api/workspace', {
              method: 'GET',
              headers: {
                'Cache-Control': 'no-cache',
                Authorization: getLoginStorage()?.token ?? '',
              },
            }).then(r => r.status);
            toast(`Response Status: ${status}`);
          }}
        >
          Check Permission
        </Button>
        <Suspense>
          <Viewer
            theme={useTheme().resolvedTheme === 'light' ? 'light' : 'dark'}
            value={user}
          />
        </Suspense>
      </MainContainer>
    </AppContainer>
  );
};

export default LoginDevPage;
