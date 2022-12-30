import { bareClient } from './request.js';

export interface AccessTokenMessage {
  create_at: number;
  exp: number;
  email: string;
  id: string;
  name: string;
  avatar_url: string;
}

export type Callback = (user: AccessTokenMessage | null) => void;

type LoginParams = {
  type: 'Google' | 'Refresh';
  token: string;
};

type LoginResponse = {
  // access token, expires in a very short time
  token: string;
  // Refresh token
  refresh: string;
};

const login = (params: LoginParams): Promise<LoginResponse> =>
  bareClient.post('api/user/token', { json: params }).json();

class Token {
  private _accessToken!: string;
  private _refreshToken!: string;

  private _user!: AccessTokenMessage | null;
  private _padding?: Promise<LoginResponse>;

  constructor() {
    this._setToken(); // fill with default value
  }

  private _setToken(login?: LoginResponse) {
    console.log('set login', login);
    this._accessToken = login?.token || '';
    this._refreshToken = login?.refresh || '';

    this._user = Token.parse(this._accessToken);
    if (login) {
      this.triggerChange(this._user);
    }
  }

  async initToken(token: string) {
    this._setToken(await login({ token, type: 'Google' }));
  }

  async refreshToken(token?: string) {
    if (!this._refreshToken && !token) {
      throw new Error('No authorization token.');
    }
    if (!this._padding) {
      this._padding = login({
        type: 'Refresh',
        token: this._refreshToken || token!,
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
      return JSON.parse(
        String.fromCharCode.apply(
          null,
          Array.from(
            Uint8Array.from(
              window.atob(
                // split jwt
                token.split('.')[1]
              ),
              c => c.charCodeAt(0)
            )
          )
        )
      );
    } catch (error) {
      return null;
    }
  }

  private callbacks: Callback[] = [];
  private lastState: AccessTokenMessage | null = null;

  triggerChange(user: AccessTokenMessage | null) {
    this.lastState = user;
    this.callbacks.forEach(callback => callback(user));
  }

  onChange(callback: Callback) {
    this.callbacks.push(callback);
    callback(this.lastState);
  }

  offChange(callback: Callback) {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }
}

export const token = new Token();
