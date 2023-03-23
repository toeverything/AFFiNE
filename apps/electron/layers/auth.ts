import ElectronGoogleOAuth2 from '@nosferatu500/electron-google-oauth2';
import * as http from 'http';
import fetch from 'node-fetch';

const oauthLoopbackPort = 43102;
export const myApiOauth = new ElectronGoogleOAuth2(
  process.env.AFFINE_GOOGLE_CLIENT_ID || '',
  process.env.AFFINE_GOOGLE_CLIENT_SECRET || '',
  ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'profile'],
  {
    loopbackInterfaceRedirectionPort: oauthLoopbackPort,
  }
);

export const startAuthListener = () => {
  const host = '127.0.0.1';
  const port = oauthLoopbackPort;
  const httpHandler: http.RequestListener = (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write(`<script>window.location.href = "affine://${req.url}";</script>`);
    res.end();
  };

  const httpServer = http.createServer(httpHandler);
  httpServer.listen(port, host, () => {
    console.log(`HTTP server running at http://${host}:${port}/`);
  });
};

const tokenEndpoint = 'https://oauth2.googleapis.com/token';

export const exchangeToken = async (code: string) => {
  const postData = {
    code,
    client_id: process.env.AFFINE_GOOGLE_CLIENT_ID || '',
    client_secret: process.env.AFFINE_GOOGLE_CLIENT_SECRET || '',
    redirect_uri: 'http://127.0.0.1:43102/callback',
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
