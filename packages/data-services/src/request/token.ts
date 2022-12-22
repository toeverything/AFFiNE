import { AuthorizationEvent } from './events';
import { login } from '../sdks';

export interface AccessTokenMessage {
  create_at: number;
  exp: number;
  email: string;
  id: string;
  name: string;
  avatar_url: string;
}

const TOKEN_KEY = 'affine_token';

function b64DecodeUnicode(str: string) {
  // Going backwards: from byte stream, to percent-encoding, to original string.
  return decodeURIComponent(
    window
      .atob(str)
      .split('')
      .map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join('')
  );
}

function parseAccessToken(token: string): AccessTokenMessage | null {
  try {
    const message: AccessTokenMessage = JSON.parse(
      b64DecodeUnicode(token.split('.')[1])
    );
    message.id = message.id.toString();
    return message;
  } catch (error) {
    return null;
  }
}

export function isAccessTokenExpired(token: string) {
  const message = parseAccessToken(token);
  if (!message) {
    return true;
  }
  return Date.now() - message.create_at > message.exp;
}

export function getToken(): {
  accessToken: string;
  refreshToken: string;
} | null {
  try {
    return JSON.parse(window.localStorage.getItem(TOKEN_KEY) || '');
  } catch (error) {
    return null;
  }
}

export const authorizationEvent = new AuthorizationEvent();
authorizationEvent.triggerChange(
  parseAccessToken(getToken()?.accessToken || '')
);

interface Token {
  accessToken: string;
  refreshToken: string;
}

export function setToken(token: Token | null): void {
  if (token === null) {
    window.localStorage.removeItem(TOKEN_KEY);
    authorizationEvent.triggerChange(null);
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  authorizationEvent.triggerChange(parseAccessToken(token.accessToken));
}

let refreshingToken: ReturnType<typeof login> | undefined;

export const refreshToken = async () => {
  let token = getToken();
  if (!token) {
    throw new Error('No authorization token.');
  }
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
  return token;
};
