import { globalContextAtom } from '@affine/jotai';
import { useRouter } from '@affine/jotai';
import { useAtom } from 'jotai';
import type { PropsWithChildren, ReactElement } from 'react';

export function GlobalContextProvider({
  children,
}: PropsWithChildren): ReactElement {
  const [globalContext, setGlobalContext] = useAtom(globalContextAtom);
  const router = useRouter();
  if (!globalContext.router) {
    setGlobalContext({
      ...globalContext,
      router,
    });
  }
  return <>{children}</>;
}
