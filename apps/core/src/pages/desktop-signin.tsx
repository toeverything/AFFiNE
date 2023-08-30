import { signIn, type SignInResponse } from 'next-auth/react';
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';

const supportedProvider = z.enum(['google']);

let wip = false;

export const Component = () => {
  const [params] = useSearchParams();
  const provider = useMemo(() => {
    const maybeProvider = supportedProvider.safeParse(params.get('provider'));
    return maybeProvider.success ? maybeProvider.data : null;
  }, [params]);

  const callback_url = params.get('callback_url');

  useEffect(() => {
    if (wip) {
      return;
    }
    if (provider && callback_url) {
      wip = true;
      signIn(provider, {
        callbackUrl: callback_url,
      }).catch((res: SignInResponse | undefined) => {
        if (res?.error) {
          console.error(res.error);
        }
      });
    }
  }, [provider, callback_url]);
  return null;
};
