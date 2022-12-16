import type { AxiosRequestConfig } from 'axios';
import { login } from '../../../sdks';
import { AuthorizationEvent } from './events';
import type { AccessTokenMessage } from './types';

const TOKEN_KEY = 'affine_token';

export const authorizationEvent = new AuthorizationEvent();
authorizationEvent.triggerChange(
  parseAccessToken(getToken()?.accessToken || '')
);

interface Token {
  accessToken: string;
  refreshToken: string;
}

/**
 * set null to clear token
 */
export function setToken(token: Token | null): void {
  if (token === null) {
    window.localStorage.removeItem(TOKEN_KEY);
    authorizationEvent.triggerChange(null);
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  authorizationEvent.triggerChange(parseAccessToken(token.accessToken));
}

function getToken(): { accessToken: string; refreshToken: string } | null {
  try {
    return JSON.parse(window.localStorage.getItem(TOKEN_KEY) || '');
  } catch (error) {
    return null;
  }
}

function parseAccessToken(token: string): AccessTokenMessage | null {
  try {
    const message: AccessTokenMessage = JSON.parse(
      window.atob(token.split('.')[1])
    );
    return message;
  } catch (error) {
    return null;
  }
}

function isAccessTokenExpired(token: string) {
  const message = parseAccessToken(token);
  if (!message) {
    return true;
  }
  return Date.now() - message.create_at > message.exp;
}

async function isLoggedIn(): Promise<boolean> {
  const token = getToken();
  if (!token) {
    return false;
  }
  return isAccessTokenExpired(token.accessToken);
}

let refreshingToken: ReturnType<typeof login> | undefined;

export async function setAuthorization(config: AxiosRequestConfig<unknown>) {
  if (!config.headers) {
    config.headers = {};
  }

  if (config.withAuthorization) {
    let token = getToken();
    if (!token) {
      throw new Error('No authorization token.');
    }
    if (isAccessTokenExpired(token.accessToken)) {
      if (!refreshingToken) {
        refreshingToken = login({
          type: 'Refresh',
          token: token.refreshToken,
        });
      }
      const newToken = await refreshingToken;
      token = {
        accessToken: newToken.token,
        refreshToken: newToken.refresh,
      };
      setToken(token);
      refreshingToken = undefined;
    }
    if (!config.headers) {
      config.headers = {};
    }
    config.headers['Authorization'] = token.accessToken;
  }
  return config;
}
