import { bareClient } from '.';
import { AuthorizationEvent, Callback } from './events';

export interface AccessTokenMessage {
  create_at: number;
  exp: number;
  email: string;
  id: string;
  name: string;
  avatar_url: string;
}

const TOKEN_KEY = 'affine_token';

type LoginParams = {
  type: 'Google' | 'Refresh';
  token: string;
};

type LoginResponse = {
  // JWT, expires in a very short time
  token: string;
  // Refresh token
  refresh: string;
};

const login = (params: LoginParams): Promise<LoginResponse> =>
  bareClient.post('/api/user/token', { json: params }).json();

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

function getRefreshToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch (_) {
    return '';
  }
}
function setRefreshToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (_) {}
}

class Token {
  private readonly _event: AuthorizationEvent;
  private _accessToken: string;
  private _refreshToken: string;

  private _user: AccessTokenMessage | null;
  private _padding?: Promise<LoginResponse>;

  constructor(refreshToken?: string) {
    this._accessToken = '';
    this._refreshToken = refreshToken || getRefreshToken();
    this._event = new AuthorizationEvent();

    this._user = Token.parse(this._accessToken);
    this._event.triggerChange(this._user);
  }

  private _setToken(login: LoginResponse) {
    this._accessToken = login.token;
    this._refreshToken = login.refresh;
    this._user = Token.parse(login.token);

    this._event.triggerChange(this._user);

    setRefreshToken(login.refresh);
  }

  async initToken(token: string) {
    this._setToken(await login({ token, type: 'Google' }));
  }

  async refreshToken() {
    if (!this._refreshToken) {
      throw new Error('No authorization token.');
    }
    if (!this._padding) {
      this._padding = login({
        type: 'Refresh',
        token: this._refreshToken,
      });
    }
    this._setToken(await this._padding);
    this._padding = undefined;
  }

  get token() {
    return this._accessToken;
  }

  get refresh() {
    return this._refreshToken;
  }

  get isLogin() {
    return !!this._refreshToken;
  }

  get isExpired() {
    if (!this._user) return true;
    return Date.now() - this._user.create_at > this._user.exp;
  }

  static parse(token: string): AccessTokenMessage | null {
    try {
      const message: AccessTokenMessage = JSON.parse(
        b64DecodeUnicode(token.split('.')[1])
      );
      return message;
    } catch (error) {
      return null;
    }
  }

  onChange(callback: Callback) {
    this._event.onChange(callback);
  }

  offChange(callback: Callback) {
    this._event.removeCallback(callback);
  }
}

export const token = new Token();
