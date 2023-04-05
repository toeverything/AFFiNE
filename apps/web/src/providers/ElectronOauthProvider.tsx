import { SignMethod } from '@affine/workspace/affine/login';
import type React from 'react';
import { useEffect } from 'react';

import { useAffineLogIn } from '../hooks/affine/use-affine-log-in';

export const ElectronOauthProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const handleLogin = useAffineLogIn();
  useEffect(() => {
    window.apis?.ipcRenderer.on('send-token', async (code: string) => {
      try {
        await handleLogin(SignMethod.Credential, code);
      } catch (e) {
        console.error(e);
      }
    });
    return () => {
      window.apis?.ipcRenderer.off('send-token');
    };
  }, [handleLogin]);
  return <>{children}</>;
};
