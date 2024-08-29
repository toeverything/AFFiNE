import { apis, appInfo } from '@affine/electron-api';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';
import { type LoaderFunction, redirect } from 'react-router-dom';

import { AuthService } from '../modules/cloud';

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const queries = url.searchParams;
  const email = queries.get('email');
  const token = queries.get('token');
  const redirectUri = queries.get('redirect_uri');

  if (!email || !token) {
    return redirect('/404');
  }

  const res = await fetch('/api/auth/magic-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, token }),
  });

  if (environment.isDesktop && appInfo?.windowName === 'hidden-window') {
    // do nothing in hidden window (loading home page will unnecessary init the data loading routine)
    apis?.ui.hiddenWindowSignIn(res.ok ? 'success' : 'failed').catch(e => {
      console.error('failed to notify hidden window sign-in status', e);
    });
    return;
  }

  if (!res.ok) {
    let error: string;
    try {
      const { message } = await res.json();
      error = message;
    } catch {
      error = 'failed to verify sign-in token';
    }
    return redirect(`/signIn?error=${encodeURIComponent(error)}`);
  }

  location.href = redirectUri || '/';
  return null;
};

export const Component = () => {
  const service = useService(AuthService);
  const user = useLiveData(service.session.account$);
  useEffect(() => {
    service.session.revalidate();
  }, [service]);

  // TODO(@pengx17): window.close() in electron hidden window will close main window as well
  if (!environment.isDesktop && user) {
    window.close();
  }

  // TODO(@eyhn): loading ui
  return null;
};
