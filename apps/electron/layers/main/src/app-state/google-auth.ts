import type { RequestInit } from 'undici';
import { fetch, ProxyAgent } from 'undici';

const redirectUri = 'https://affine.pro/client/auth-callback';

export const oauthEndpoint = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.AFFINE_GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=openid https://www.googleapis.com/auth/userinfo.email profile&access_type=offline&customParameters={"prompt":"select_account"}`;

const tokenEndpoint = 'https://oauth2.googleapis.com/token';

export const exchangeToken = async (code: string) => {
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const proxyAgent = httpProxy ? new ProxyAgent(httpProxy) : undefined;

  const postData = {
    code,
    client_id: process.env.AFFINE_GOOGLE_CLIENT_ID || '',
    client_secret: process.env.AFFINE_GOOGLE_CLIENT_SECRET || '',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  };
  const requestOptions: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(postData).toString(),
    dispatcher: proxyAgent,
  };
  return fetch(tokenEndpoint, requestOptions).then(response => {
    return response.json();
  });
};
