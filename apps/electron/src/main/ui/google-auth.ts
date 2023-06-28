import { app, BrowserWindow, shell } from 'electron';
import { parse } from 'url';

import { logger } from '../logger';

const redirectUri = 'https://affine.pro/client/auth-callback';

export const oauthEndpoint = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.AFFINE_GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=openid https://www.googleapis.com/auth/userinfo.email profile&access_type=offline&customParameters={"prompt":"select_account"}`;

const tokenEndpoint = 'https://oauth2.googleapis.com/token';

export const getExchangeTokenParams = (code: string) => {
  const postData = {
    code,
    client_id: process.env.AFFINE_GOOGLE_CLIENT_ID || '',
    client_secret: process.env.AFFINE_GOOGLE_CLIENT_SECRET || '',
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  };
  const requestInit: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(postData).toString(),
  };
  return { requestInit, url: tokenEndpoint };
};

export function getGoogleOauthCode() {
  return new Promise<ReturnType<typeof getExchangeTokenParams>>(
    (resolve, reject) => {
      shell.openExternal(oauthEndpoint).catch(e => {
        logger.error('Failed to open external url', e);
        reject(e);
      });
      const handleOpenUrl = async (_: any, url: string) => {
        const mainWindow = BrowserWindow.getAllWindows().find(
          w => !w.isDestroyed()
        );
        const urlObj = parse(url.replace('??', '?'), true);
        if (!mainWindow || !url.startsWith('affine://auth-callback')) return;
        const code = urlObj.query['code'] as string;
        if (!code) return;

        logger.info('google sign in code received from callback', code);

        app.removeListener('open-url', handleOpenUrl);
        resolve(getExchangeTokenParams(code));
      };

      app.on('open-url', handleOpenUrl);

      setTimeout(() => {
        reject(new Error('Timed out'));
        app.removeListener('open-url', handleOpenUrl);
      }, 30000);
    }
  );
}
