import { useLiveData, useService } from '@toeverything/infra';
import { useEffect } from 'react';
import { type LoaderFunction, redirect } from 'react-router-dom';

import { AuthService } from '../modules/cloud';

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const queries = url.searchParams;
  const code = queries.get('code');
  let stateStr = queries.get('state') ?? '{}';

  let error: string | undefined;
  try {
    const { state, client } = JSON.parse(stateStr);
    stateStr = state;

    // bypass code & state to redirect_uri
    if (!environment.isDesktop && client && client !== 'web') {
      url.searchParams.set('state', JSON.stringify({ state }));
      return redirect(
        `/open-app/url?url=${encodeURIComponent(`${client}://${url.pathname}${url.search}`)}&hidden=true`
      );
    }
  } catch {
    error = 'Invalid oauth callback parameters';
  }

  const res = await fetch('/api/oauth/callback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code, state: stateStr }),
  });

  if (!res.ok) {
    try {
      const { message } = await res.json();
      error = message;
    } catch {
      error = 'failed to verify sign-in token';
    }
  }

  if (error) {
    // TODO(@pengx17): in desktop app, the callback page will be opened in a hidden window
    // how could we tell the main window to show the error message?
    return redirect(`/signIn?error=${encodeURIComponent(error)}`);
  } else {
    const body = await res.json();
    /* @deprecated handle for old client */
    if (body.redirect_uri) {
      return redirect(body.redirect_uri);
    }
  }

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

  return null;
};
