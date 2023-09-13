import '@toeverything/hooks/use-affine-ipc-renderer';

import { SessionProvider } from '@toeverything/auth/react';
import { type PropsWithChildren } from 'react';

export const CloudSessionProvider = ({ children }: PropsWithChildren) => {
  return <SessionProvider refetchOnWindowFocus>{children}</SessionProvider>;
};
