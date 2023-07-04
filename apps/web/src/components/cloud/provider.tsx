import { SessionProvider } from 'next-auth/react';
import type { PropsWithChildren, ReactElement } from 'react';

export const Provider = (props: PropsWithChildren): ReactElement => {
  if (!runtimeConfig.enableCloud) {
    return <>{props.children}</>;
  }
  return <SessionProvider>{props.children}</SessionProvider>;
};
