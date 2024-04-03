import { type LoaderFunction, Navigate, useLoaderData } from 'react-router-dom';

const trustedDomain = [
  'stripe.com',
  'github.com',
  'twitter.com',
  'discord.gg',
  'youtube.com',
  't.me',
  'reddit.com',
];

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const redirectUri = searchParams.get('redirect_uri');

  if (!redirectUri) {
    return { allow: false };
  }

  const target = new URL(redirectUri);

  if (
    trustedDomain.some(domain =>
      new RegExp(`.?${domain}$`).test(target.hostname)
    )
  ) {
    location.href = redirectUri;
  }

  return { allow: true };
};

export const Component = () => {
  const { allow } = useLoaderData() as { allow: boolean };

  if (allow) {
    return null;
  }

  return <Navigate to="/404" />;
};
