import { signIn, type SignInResponse } from 'next-auth/react';
import type { LoaderFunction } from 'react-router-dom';
import { z } from 'zod';

const supportedProvider = z.enum(['google']);

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const provider = searchParams.get('provider');
  const callback_url = searchParams.get('callback_url');
  if (!callback_url) {
    return null;
  }
  const maybeProvider = supportedProvider.safeParse(provider);
  if (maybeProvider.success) {
    const provider = maybeProvider.data;
    await signIn(provider, {
      callbackUrl: callback_url,
    }).catch((res: SignInResponse | undefined) => {
      if (res?.error) {
        console.error(res.error);
      }
    });
  }
  return null;
};

export const Component = () => {
  return null;
};
