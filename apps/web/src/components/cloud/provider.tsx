import { SessionProvider } from 'next-auth/react';
import type { PropsWithChildren, ReactElement } from 'react';

export const Provider = (props: PropsWithChildren): ReactElement => {
  return <SessionProvider>{props.children}</SessionProvider>;
};
