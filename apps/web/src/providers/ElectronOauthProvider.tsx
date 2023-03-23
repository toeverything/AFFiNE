import { useRouter } from 'next/router';
import type React from 'react';
import { useEffect } from 'react';

import { apis } from '../shared/apis';

export const ElectronOauthProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const router = useRouter();
  useEffect(() => {
    // @ts-ignore
    window.electron?.ipcRenderer.on('send-token', async (code: string) => {
      try {
        await apis.signInWithOauthCode(code);
        router.reload();
      } catch (e) {
        console.error(e);
      }
    });
    return () => {
      // @ts-ignore
      window.electron?.ipcRenderer.off('send-token');
    };
  });
  return <>{children}</>;
};
