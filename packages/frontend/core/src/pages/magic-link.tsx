import { type LoaderFunction, redirect } from 'react-router-dom';

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

  if (!res.ok) {
    let error: string;
    try {
      const { message } = await res.json();
      error = message;
    } catch (e) {
      error = 'failed to verify sign-in token';
    }
    return redirect(`/signIn?error=${encodeURIComponent(error)}`);
  }

  location.href = redirectUri || '/';
  return null;
};

export const Component = () => {
  // TODO(@eyhn): loading ui
  return null;
};
