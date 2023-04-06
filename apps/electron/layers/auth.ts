import fetch from 'node-fetch';

const redirectUri = 'https://affine.pro/auth-callback';
export const oauthEndpoint = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.AFFINE_GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=openid https://www.googleapis.com/auth/userinfo.email profile&access_type=offline`;

const tokenEndpoint = 'https://oauth2.googleapis.com/token';

export const exchangeToken = async (code: string) => {
  const postData = {
    code,
    client_id: process.env.AFFINE_GOOGLE_CLIENT_ID || '',
    client_secret: process.env.AFFINE_GOOGLE_CLIENT_SECRET || '',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  };
  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(postData).toString(),
  };
  return fetch(tokenEndpoint, requestOptions).then(response => response.json());
};
