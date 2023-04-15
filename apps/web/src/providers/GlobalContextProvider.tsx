import { globalContextAtom, isInaccessible } from '@affine/jotai';
import { useAtom } from 'jotai';
import { useRouter } from 'next/router';
import type { PropsWithChildren, ReactElement } from 'react';
import { useEffect } from 'react';

export function GlobalContextProvider({
  children,
}: PropsWithChildren): ReactElement {
  const [globalContext, setGlobalContext] = useAtom(globalContextAtom);
  const router = useRouter();
  if (isInaccessible(globalContext.router)) {
    setGlobalContext(globalContext => ({
      ...globalContext,
      router,
    }));
  }
  useEffect(() => {
    setGlobalContext(globalContext => ({
      ...globalContext,
      router,
    }));
  }, [router, setGlobalContext]);
  return <>{children}</>;
}
